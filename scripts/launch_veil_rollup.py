#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

try:
    import pexpect
except ImportError:
    print(
        "pexpect is required. Install it with `python3 -m pip install pexpect`.",
        file=sys.stderr,
    )
    raise SystemExit(1)
LOCAL_BIN_DIR = str(Path.home() / ".local" / "bin")
ANSI_ESCAPE_RE = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]")
INSUFFICIENT_BALANCE_RE = re.compile(
    r"insufficient initia balance: have (\d+) uinit, want (\d+)(?: uinit)?",
    re.IGNORECASE,
)
INSUFFICIENT_DA_BALANCE_RE = re.compile(
    r"insufficient DA balance\.\s*Required:\s*(\d+)utia,\s*Available:\s*(\d+)utia",
    re.IGNORECASE | re.DOTALL,
)
LAUNCH_SUCCESS_RE = re.compile(r"rollup has been launched", re.IGNORECASE)
COMMAND_FAILED_RE = re.compile(r"command execution failed:", re.IGNORECASE)
MINITIAD_LAUNCH_RE = re.compile(r"Running `minitiad launch`", re.IGNORECASE)


class LaunchError(RuntimeError):
    pass


class InsufficientBalanceError(LaunchError):
    def __init__(self, have: str, want: str) -> None:
        super().__init__(
            "Gas Station balance too low on Initia L1: "
            f"have {have} uinit, want {want} uinit. "
            "Fund the Initia Gas Station address shown by `weave gas-station show` and rerun."
        )
        self.have = have
        self.want = want


class InsufficientDABalanceError(LaunchError):
    def __init__(self, available: str, required: str) -> None:
        super().__init__(
            "DA gas station balance too low: "
            f"have {available} utia, want {required} utia. "
            "Fund the Celestia Gas Station address shown by `weave gas-station show`, "
            "or rerun after selecting Initia L1 as DA."
        )
        self.available = available
        self.required = required


def log(message: str) -> None:
    print(f"[veil-rollup] {message}", flush=True)


def clean_output(text: str) -> str:
    cleaned = ANSI_ESCAPE_RE.sub("", text or "")
    return cleaned.replace("\r\n", "\n").replace("\r", "\n")


def emit_weave_output(text: str) -> None:
    for line in clean_output(text).splitlines():
        stripped = line.strip()
        if stripped:
            log(f"Weave: {stripped}")


def wait_for_local_rpc(chain_id: str, timeout: int) -> None:
    deadline = time.monotonic() + timeout

    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise LaunchError("Timed out while waiting for the local rollup RPC to become healthy.")

        try:
            with urllib.request.urlopen("http://127.0.0.1:26657/status", timeout=min(5, remaining)) as response:
                payload = json.load(response)
            network = (
                payload.get("result", {})
                .get("node_info", {})
                .get("network")
            )
            if network == chain_id:
                return
        except (OSError, urllib.error.URLError, json.JSONDecodeError, TimeoutError):
            pass

        time.sleep(1)


def build_exec_env() -> dict[str, str]:
    env = dict(os.environ)
    current_path = env.get("PATH", "")

    if LOCAL_BIN_DIR not in current_path.split(":"):
        env["PATH"] = f"{LOCAL_BIN_DIR}:{current_path}" if current_path else LOCAL_BIN_DIR

    env.setdefault("TERM", "xterm-256color")
    return env


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Drive the verified Weave Move rollup launch flow for Veil.",
    )
    parser.add_argument("--chain-id", default="veil-signal-1")
    parser.add_argument("--gas-station-genesis-balance", default="100000000")
    parser.add_argument("--home", default=str(Path.home() / ".minitia"))
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--step-timeout", type=int, default=120)
    parser.add_argument("--launch-timeout", type=int, default=1800)
    return parser.parse_args()


def preflight(args: argparse.Namespace) -> None:
    env = build_exec_env()

    if shutil.which("weave", path=env.get("PATH")) is None:
        raise LaunchError("`weave` was not found on PATH. Export `$HOME/.local/bin` first.")

    home_path = Path(args.home).expanduser()
    if home_path.exists():
        if not args.force:
            raise LaunchError(
                f"{home_path} already exists. Remove it manually or rerun this helper with --force."
            )
        shutil.rmtree(home_path)
        log(f"Removed existing {home_path}")


def expect_any(
    child: pexpect.spawn,
    patterns: list[object],
    step: str,
    timeout: int,
) -> int:
    try:
        return child.expect(patterns, timeout=timeout)
    except pexpect.TIMEOUT as exc:
        raise LaunchError(f"Timed out while waiting for {step}.") from exc
    except pexpect.EOF as exc:
        text = child.before or ""
        match = INSUFFICIENT_BALANCE_RE.search(text)
        if match:
            raise InsufficientBalanceError(match.group(1), match.group(2)) from exc
        da_match = INSUFFICIENT_DA_BALANCE_RE.search(text)
        if da_match:
            raise InsufficientDABalanceError(da_match.group(2), da_match.group(1)) from exc
        raise LaunchError(f"Weave exited unexpectedly while waiting for {step}.") from exc


def press_enter(child: pexpect.spawn) -> None:
    child.send("\r")


def press_tab(child: pexpect.spawn) -> None:
    child.sendcontrol("i")


def press_down(child: pexpect.spawn) -> None:
    child.send("\x1b[B")


def choose_no(child: pexpect.spawn) -> None:
    press_down(child)
    press_enter(child)


def accept_default(child: pexpect.spawn) -> None:
    press_tab(child)
    press_enter(child)


def wait_for_clean_screen(
    child: pexpect.spawn,
    markers: list[str],
    step: str,
    timeout: int,
) -> str:
    deadline = time.monotonic() + timeout

    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise LaunchError(f"Timed out while waiting for {step}.")

        result_index = child.expect(
            [pexpect.TIMEOUT, pexpect.EOF],
            timeout=min(2, remaining),
        )
        screen = clean_output(child.before or "")

        if all(marker in screen for marker in markers):
            return screen

        if result_index == 1:
            raise LaunchError(f"Weave exited unexpectedly while waiting for {step}.")


def wait_for_launch_result(child: pexpect.spawn, timeout: int, chain_id: str) -> None:
    deadline = time.monotonic() + timeout

    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise LaunchError("Timed out while waiting for launch result.")

        result_index = child.expect(
            [
                INSUFFICIENT_BALANCE_RE,
                INSUFFICIENT_DA_BALANCE_RE,
                LAUNCH_SUCCESS_RE,
                COMMAND_FAILED_RE,
                MINITIAD_LAUNCH_RE,
                pexpect.TIMEOUT,
                pexpect.EOF,
            ],
            timeout=min(30, remaining),
        )
        emit_weave_output(child.before or "")

        if result_index == 0:
            match = INSUFFICIENT_BALANCE_RE.search(child.after or "")
            if match:
                raise InsufficientBalanceError(match.group(1), match.group(2))
            raise LaunchError("Gas Station balance was insufficient on Initia L1.")

        if result_index == 1:
            da_match = INSUFFICIENT_DA_BALANCE_RE.search(child.after or "")
            if da_match:
                raise InsufficientDABalanceError(da_match.group(2), da_match.group(1))
            raise LaunchError("Gas Station balance was insufficient on the configured DA layer.")

        if result_index == 2:
            emit_weave_output(child.after or "")
            return

        if result_index == 3:
            emit_weave_output(child.after or "")
            raise LaunchError("Weave reported a launch failure after the funding transaction.")

        if result_index == 4:
            emit_weave_output(child.after or "")
            wait_for_local_rpc(chain_id, 120)
            return

        if result_index == 5:
            log("Waiting for Weave to finish launch...")
            continue

        trailing_output = clean_output((child.before or "") + (child.after or ""))
        da_match = INSUFFICIENT_DA_BALANCE_RE.search(trailing_output)
        if da_match:
            raise InsufficientDABalanceError(da_match.group(2), da_match.group(1))
        if LAUNCH_SUCCESS_RE.search(trailing_output):
            emit_weave_output(child.after or "")
            return
        if MINITIAD_LAUNCH_RE.search(trailing_output):
            wait_for_local_rpc(chain_id, 120)
            return
        raise LaunchError("Weave exited before the launcher could confirm final status.")


def run_launch(args: argparse.Namespace) -> None:
    env = build_exec_env()
    home_path = Path(args.home).expanduser()

    child = pexpect.spawn(
        "weave",
        [
            "rollup",
            "launch",
            "--minitia-dir",
            str(home_path),
        ],
        env=env,
        encoding="utf-8",
        codec_errors="ignore",
        echo=False,
    )
    child.delaybeforesend = 0.1

    try:
        expect_any(child, [r"Testnet"], "network selector", args.step_timeout)
        press_enter(child)
        log("Selected Testnet")

        next_index = expect_any(
            child,
            [r"Enter your chain ID", r"rollup chain ID", r"Move", r"Select a VM", r"VM"],
            "VM selector or chain ID prompt",
            args.step_timeout,
        )
        if next_index >= 2:
            press_enter(child)
            log("Selected Move VM")
            expect_any(child, [r"Enter your chain ID", r"rollup chain ID"], "chain ID prompt", args.step_timeout)

        child.send(f"{args.chain_id}\r")
        log(f"Entered chain ID: {args.chain_id}")

        expect_any(child, [r"rollup gas denom", r"umin"], "gas denom prompt", args.step_timeout)
        accept_default(child)
        log("Accepted default gas denom: umin")

        expect_any(child, [r"rollup node moniker", r"operator"], "moniker prompt", args.step_timeout)
        accept_default(child)
        log("Accepted default moniker: operator")

        expect_any(child, [r"Submission Interval"], "submission interval prompt", args.step_timeout)
        accept_default(child)
        log("Accepted default submission interval: 1m")

        expect_any(
            child,
            [r"Output Finalization Period"],
            "finalization period prompt",
            args.step_timeout,
        )
        accept_default(child)
        log("Accepted default finalization period: 168h")

        wait_for_clean_screen(
            child,
            [
                "Where should the rollup blocks and transaction data be submitted",
                "> Celestia",
                "Initia L1",
            ],
            "DA selector",
            args.step_timeout,
        )
        # Weave defaults this selector to Celestia. Move once to select Initia L1.
        press_down(child)
        press_enter(child)
        log("Selected Initia L1 as DA")

        expect_any(
            child,
            [r"Enable", r"oracle", r"Would you like to enable oracle price feed from L1"],
            "oracle selector",
            args.step_timeout,
        )
        press_enter(child)
        log("Enabled oracle")

        expect_any(
            child,
            [r"Select a setup method for the system keys", r"system keys"],
            "system key setup prompt",
            args.step_timeout,
        )
        press_enter(child)
        log("Selected generated system keys")

        next_index = expect_any(
            child,
            [
                r"Use the default preset",
                r"Please set up a gas station account",
                r"Total amount required",
                r"Gas Station account",
            ],
            "gas station or funding preset prompt",
            args.step_timeout,
        )
        if next_index == 1 or next_index == 3:
            raise LaunchError(
                "No Gas Station account is configured in Weave. Run `weave gas-station setup` first."
            )
        press_enter(child)
        log("Selected default funding preset. Weave will validate the required Initia L1 balance during broadcast.")

        expect_any(child, [r"fee whitelist"], "fee whitelist prompt", args.step_timeout)
        press_enter(child)
        log("Left fee whitelist empty")

        expect_any(
            child,
            [
                r"Would you like to add the gas station account to genesis accounts",
                r"gas station account to genesis accounts",
                r"relayer init",
            ],
            "gas-station genesis prompt",
            args.step_timeout,
        )
        press_enter(child)
        log("Chose to add gas-station to rollup genesis")

        expect_any(
            child,
            [r"Specify the genesis balance for the gas station account"],
            "gas-station genesis balance prompt",
            args.step_timeout,
        )
        child.send(f"{args.gas_station_genesis_balance}\r")
        log(
            "Seeded gas-station in rollup genesis with "
            f"{args.gas_station_genesis_balance}umin"
        )

        child.expect(
            [
                r"Would you like to add genesis accounts",
                r"add genesis accounts",
                r"extra genesis accounts",
                pexpect.TIMEOUT,
            ],
            timeout=min(args.step_timeout, 5),
        )
        choose_no(child)
        log("Skipped extra genesis accounts")

        continue_index = expect_any(
            child,
            [r"Type .*continue.* proceed", r"System keys have been successfully generated"],
            "system key confirmation prompt",
            args.launch_timeout,
        )
        if continue_index == 1:
            expect_any(
                child,
                [r"Type .*continue.* proceed"],
                "continue prompt",
                args.step_timeout,
            )
        child.send("continue\r")
        log("Advanced past the mnemonic confirmation screen")

        expect_any(
            child,
            [r"signing and broadcasting the following transactions", r"Confirm to proceed", r"broadcasting the following transactions"],
            "broadcast confirmation prompt",
            args.step_timeout,
        )
        child.send("y\r")
        log("Confirmed Gas Station funding transaction")
        log("Waiting for Weave to finish launch...")

        wait_for_launch_result(child, args.launch_timeout, args.chain_id)

        log("Rollup launch completed successfully")
        log("Next: import gas-station into `minitiad`, publish `move/veil_signal`, and update submission metadata.")
    finally:
        child.close(force=True)


def cleanup_failed_home(args: argparse.Namespace) -> None:
    home_path = Path(args.home).expanduser()
    if home_path.exists():
        shutil.rmtree(home_path)
        log(f"Removed failed launch home at {home_path}")


def main() -> int:
    args = parse_args()
    launch_prepared = False

    try:
        preflight(args)
        launch_prepared = True
        run_launch(args)
    except InsufficientBalanceError as exc:
        if launch_prepared:
            cleanup_failed_home(args)
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    except LaunchError as exc:
        if launch_prepared:
            cleanup_failed_home(args)
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
