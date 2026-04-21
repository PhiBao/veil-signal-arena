module veil::signal_arena_v3 {
    use std::error;
    use std::option;
    use std::option::Option;
    use std::signer;
    use std::string::String;
    use std::string;
    use std::timestamp;
    use std::vector;
    use initia_std::coin;

    const E_STATE_MISSING: u64 = 1;
    const E_ALREADY_INITIALIZED: u64 = 2;
    const E_COMMITMENT_NOT_FOUND: u64 = 3;
    const E_ALREADY_REVEALED: u64 = 4;
    const E_INVALID_CONFIDENCE: u64 = 5;
    const E_NOT_COMMITMENT_OWNER: u64 = 6;
    const E_INVALID_MODULE_OWNER: u64 = 7;
    const E_HASH_MISMATCH: u64 = 8;
    const E_INSUFFICIENT_FEE: u64 = 9;
    const E_FEE_ALREADY_CONFIGURED: u64 = 10;
    const E_FEE_CONFIG_NOT_FOUND: u64 = 11;

    struct Commitment has copy, drop, store {
        id: u64,
        owner: address,
        arena_id: String,
        route_mode: String,
        commitment_hash: String,
        confidence: u64,
        created_at_secs: u64,
        revealed_at_secs: Option<u64>,
        revealed: bool,
        thesis: String,
        evidence: String,
        salt: String,
    }

    struct ReputationEntry has copy, drop, store {
        owner: address,
        score: u64,
        reveals: u64,
    }

    struct ArenaFeeConfig has copy, drop, store {
        arena_id: String,
        amount: u64,
        denom: String,
    }

    struct SignalArena has key {
        next_commitment_id: u64,
        commitments: vector<Commitment>,
        reputations: vector<ReputationEntry>,
        arena_fee_configs: vector<ArenaFeeConfig>,
    }

    fun init_module(account: &signer) {
        let owner = signer::address_of(account);
        assert!(owner == @veil, error::permission_denied(E_INVALID_MODULE_OWNER));
        assert!(!exists<SignalArena>(owner), error::already_exists(E_ALREADY_INITIALIZED));

        move_to(account, SignalArena {
            next_commitment_id: 0,
            commitments: vector::empty<Commitment>(),
            reputations: vector::empty<ReputationEntry>(),
            arena_fee_configs: vector::empty<ArenaFeeConfig>(),
        });
    }

    public entry fun commit(
        account: &signer,
        arena_id: String,
        route_mode: String,
        commitment_hash: String,
        confidence: u64,
        thesis: String,
        evidence: String,
        salt: String,
    ) acquires SignalArena {
        assert!(confidence <= 100, error::invalid_argument(E_INVALID_CONFIDENCE));
        assert!(exists<SignalArena>(@veil), error::not_found(E_STATE_MISSING));

        let arena = borrow_global_mut<SignalArena>(@veil);

        let fee_config = find_arena_fee_config(&arena.arena_fee_configs, arena_id);
        if (option::is_some(&fee_config)) {
            let config = option::borrow(&fee_config);
            let metadata = coin::denom_to_metadata(config.denom);
            let fa = coin::withdraw(account, metadata, config.amount);
            coin::deposit(@veil, fa);
        };

        let commitment_id = arena.next_commitment_id;
        arena.next_commitment_id = commitment_id + 1;

        vector::push_back(&mut arena.commitments, Commitment {
            id: commitment_id,
            owner: signer::address_of(account),
            arena_id,
            route_mode,
            commitment_hash,
            confidence,
            created_at_secs: timestamp::now_seconds(),
            revealed_at_secs: option::none<u64>(),
            revealed: false,
            thesis,
            evidence,
            salt,
        });
    }

    public entry fun reveal(
        account: &signer,
        commitment_id: u64,
    ) acquires SignalArena {
        assert!(exists<SignalArena>(@veil), error::not_found(E_STATE_MISSING));

        let arena = borrow_global_mut<SignalArena>(@veil);
        let commitment = borrow_commitment_mut(&mut arena.commitments, commitment_id);
        assert!(commitment.owner == signer::address_of(account), error::permission_denied(E_NOT_COMMITMENT_OWNER));
        assert!(!commitment.revealed, error::already_exists(E_ALREADY_REVEALED));

        commitment.revealed = true;
        commitment.revealed_at_secs = option::some(timestamp::now_seconds());

        let owner = commitment.owner;
        let confidence = commitment.confidence;
        let route_mode = commitment.route_mode;

        let reveal_points = compute_reveal_points(confidence, route_mode);
        update_reputation(&mut arena.reputations, owner, reveal_points);
    }

    fun compute_reveal_points(confidence: u64, route_mode: String): u64 {
        let base: u64 = 10;
        let confidence_bonus = confidence / 5;
        let route_bonus = if (route_mode == string::utf8(b"agent")) {
            5
        } else if (route_mode == string::utf8(b"hybrid")) {
            3
        } else {
            0
        };
        base + confidence_bonus + route_bonus
    }

    fun update_reputation(
        reputations: &mut vector<ReputationEntry>,
        owner: address,
        points: u64,
    ) {
        let total = vector::length(reputations);
        let index: u64 = 0;
        let found = false;
        while (index < total) {
            let entry = vector::borrow_mut(reputations, index);
            if (entry.owner == owner) {
                entry.score = entry.score + points;
                entry.reveals = entry.reveals + 1;
                found = true;
                break
            };
            index = index + 1;
        };
        if (!found) {
            vector::push_back(reputations, ReputationEntry {
                owner,
                score: points,
                reveals: 1,
            });
        };
    }

    public entry fun set_arena_fee(
        account: &signer,
        arena_id: String,
        amount: u64,
        denom: String,
    ) acquires SignalArena {
        assert!(signer::address_of(account) == @veil, error::permission_denied(E_INVALID_MODULE_OWNER));
        assert!(exists<SignalArena>(@veil), error::not_found(E_STATE_MISSING));
        assert!(amount > 0, error::invalid_argument(E_INSUFFICIENT_FEE));

        let arena = borrow_global_mut<SignalArena>(@veil);
        let existing = find_arena_fee_config(&arena.arena_fee_configs, arena_id);
        assert!(option::is_none(&existing), error::already_exists(E_FEE_ALREADY_CONFIGURED));

        vector::push_back(&mut arena.arena_fee_configs, ArenaFeeConfig {
            arena_id,
            amount,
            denom,
        });
    }

    public entry fun update_arena_fee(
        account: &signer,
        arena_id: String,
        amount: u64,
        denom: String,
    ) acquires SignalArena {
        assert!(signer::address_of(account) == @veil, error::permission_denied(E_INVALID_MODULE_OWNER));
        assert!(exists<SignalArena>(@veil), error::not_found(E_STATE_MISSING));
        assert!(amount > 0, error::invalid_argument(E_INSUFFICIENT_FEE));

        let arena = borrow_global_mut<SignalArena>(@veil);
        let total = vector::length(&arena.arena_fee_configs);
        let index: u64 = 0;
        let found = false;
        while (index < total) {
            let config = vector::borrow_mut(&mut arena.arena_fee_configs, index);
            if (config.arena_id == arena_id) {
                config.amount = amount;
                config.denom = denom;
                found = true;
                break
            };
            index = index + 1;
        };
        assert!(found, error::not_found(E_FEE_CONFIG_NOT_FOUND));
    }

    public entry fun remove_arena_fee(
        account: &signer,
        arena_id: String,
    ) acquires SignalArena {
        assert!(signer::address_of(account) == @veil, error::permission_denied(E_INVALID_MODULE_OWNER));
        assert!(exists<SignalArena>(@veil), error::not_found(E_STATE_MISSING));

        let arena = borrow_global_mut<SignalArena>(@veil);
        let total = vector::length(&arena.arena_fee_configs);
        let index: u64 = 0;
        let found = false;
        while (index < total) {
            let config = vector::borrow(&arena.arena_fee_configs, index);
            if (config.arena_id == arena_id) {
                found = true;
                break
            };
            index = index + 1;
        };
        assert!(found, error::not_found(E_FEE_CONFIG_NOT_FOUND));
        vector::swap_remove(&mut arena.arena_fee_configs, index);
    }

    #[view]
    public fun module_initialized(): bool {
        exists<SignalArena>(@veil)
    }

    #[view]
    public fun commitment_count(): u64 acquires SignalArena {
        if (!exists<SignalArena>(@veil)) {
            return 0
        };

        let arena = borrow_global<SignalArena>(@veil);
        vector::length(&arena.commitments)
    }

    #[view]
    public fun list_commitments(): vector<Commitment> acquires SignalArena {
        if (!exists<SignalArena>(@veil)) {
            return vector::empty<Commitment>()
        };

        let arena = borrow_global<SignalArena>(@veil);
        let copied = vector::empty<Commitment>();
        let total = vector::length(&arena.commitments);
        let index = 0;
        while (index < total) {
            let commitment = vector::borrow(&arena.commitments, index);
            vector::push_back(&mut copied, clone_commitment(commitment));
            index = index + 1;
        };

        copied
    }

    #[view]
    public fun list_commitments_by_owner(owner: address): vector<Commitment> acquires SignalArena {
        let filtered = vector::empty<Commitment>();
        if (!exists<SignalArena>(@veil)) {
            return filtered
        };

        let arena = borrow_global<SignalArena>(@veil);
        let total = vector::length(&arena.commitments);
        let index = 0;
        while (index < total) {
            let commitment = vector::borrow(&arena.commitments, index);
            if (commitment.owner == owner) {
                vector::push_back(&mut filtered, clone_commitment(commitment));
            };
            index = index + 1;
        };

        filtered
    }

    #[view]
    public fun get_commitment(commitment_id: u64): Option<Commitment> acquires SignalArena {
        if (!exists<SignalArena>(@veil)) {
            return option::none<Commitment>()
        };

        let arena = borrow_global<SignalArena>(@veil);
        let total = vector::length(&arena.commitments);
        let index = 0;
        while (index < total) {
            let commitment = vector::borrow(&arena.commitments, index);
            if (commitment.id == commitment_id) {
                return option::some(clone_commitment(commitment))
            };
            index = index + 1;
        };

        option::none<Commitment>()
    }

    #[view]
    public fun get_reputation(owner: address): Option<ReputationEntry> acquires SignalArena {
        if (!exists<SignalArena>(@veil)) {
            return option::none<ReputationEntry>()
        };

        let arena = borrow_global<SignalArena>(@veil);
        let total = vector::length(&arena.reputations);
        let index = 0;
        while (index < total) {
            let entry = vector::borrow(&arena.reputations, index);
            if (entry.owner == owner) {
                return option::some(clone_reputation_entry(entry))
            };
            index = index + 1;
        };

        option::none<ReputationEntry>()
    }

    #[view]
    public fun list_reputations(): vector<ReputationEntry> acquires SignalArena {
        if (!exists<SignalArena>(@veil)) {
            return vector::empty<ReputationEntry>()
        };

        let arena = borrow_global<SignalArena>(@veil);
        let copied = vector::empty<ReputationEntry>();
        let total = vector::length(&arena.reputations);
        let index = 0;
        while (index < total) {
            let entry = vector::borrow(&arena.reputations, index);
            vector::push_back(&mut copied, clone_reputation_entry(entry));
            index = index + 1;
        };

        copied
    }

    #[view]
    public fun get_arena_fee_config(arena_id: String): Option<ArenaFeeConfig> acquires SignalArena {
        if (!exists<SignalArena>(@veil)) {
            return option::none<ArenaFeeConfig>()
        };

        let arena = borrow_global<SignalArena>(@veil);
        find_arena_fee_config(&arena.arena_fee_configs, arena_id)
    }

    #[view]
    public fun list_arena_fee_configs(): vector<ArenaFeeConfig> acquires SignalArena {
        if (!exists<SignalArena>(@veil)) {
            return vector::empty<ArenaFeeConfig>()
        };

        let arena = borrow_global<SignalArena>(@veil);
        let copied = vector::empty<ArenaFeeConfig>();
        let total = vector::length(&arena.arena_fee_configs);
        let index = 0;
        while (index < total) {
            let config = vector::borrow(&arena.arena_fee_configs, index);
            vector::push_back(&mut copied, clone_arena_fee_config(config));
            index = index + 1;
        };

        copied
    }

    fun find_arena_fee_config(
        configs: &vector<ArenaFeeConfig>,
        arena_id: String,
    ): Option<ArenaFeeConfig> {
        let total = vector::length(configs);
        let index = 0;
        while (index < total) {
            let config = vector::borrow(configs, index);
            if (config.arena_id == arena_id) {
                return option::some(clone_arena_fee_config(config))
            };
            index = index + 1;
        };
        option::none<ArenaFeeConfig>()
    }

    fun borrow_commitment_mut(
        commitments: &mut vector<Commitment>,
        commitment_id: u64,
    ): &mut Commitment {
        let total = vector::length(commitments);
        let index = 0;
        while (index < total) {
            let commitment = vector::borrow_mut(commitments, index);
            if (commitment.id == commitment_id) {
                return commitment
            };
            index = index + 1;
        };

        abort error::not_found(E_COMMITMENT_NOT_FOUND)
    }

    fun clone_commitment(commitment: &Commitment): Commitment {
        Commitment {
            id: commitment.id,
            owner: commitment.owner,
            arena_id: commitment.arena_id,
            route_mode: commitment.route_mode,
            commitment_hash: commitment.commitment_hash,
            confidence: commitment.confidence,
            created_at_secs: commitment.created_at_secs,
            revealed_at_secs: commitment.revealed_at_secs,
            revealed: commitment.revealed,
            thesis: commitment.thesis,
            evidence: commitment.evidence,
            salt: commitment.salt,
        }
    }

    fun clone_reputation_entry(entry: &ReputationEntry): ReputationEntry {
        ReputationEntry {
            owner: entry.owner,
            score: entry.score,
            reveals: entry.reveals,
        }
    }

    fun clone_arena_fee_config(config: &ArenaFeeConfig): ArenaFeeConfig {
        ArenaFeeConfig {
            arena_id: config.arena_id,
            amount: config.amount,
            denom: config.denom,
        }
    }

    #[test(owner = @0xcafe)]
    fun test_commit_and_reveal(owner: signer) acquires SignalArena {
        timestamp::set_time_has_started_for_testing(&owner);
        timestamp::update_global_time_for_test_secs(1000);

        assert!(!module_initialized(), 100);

        init_module(&owner);
        assert!(module_initialized(), 101);
        assert!(commitment_count() == 0, 102);

        commit(
            &owner,
            string::utf8(b"macro-rift"),
            string::utf8(b"hybrid"),
            string::utf8(b"0xfeedbeef"),
            78,
            string::utf8(b"Consumer-heavy arenas will absorb the next wave."),
            string::utf8(b"Bridge volume, sponsor incentives, and creator traffic all cluster."),
            string::utf8(b"a1b2c3d4"),
        );

        let commitments = list_commitments();
        let commitment = vector::borrow(&commitments, 0);

        assert!(commitment_count() == 1, 103);
        assert!(commitment.owner == @0xcafe, 104);
        assert!(commitment.route_mode == string::utf8(b"hybrid"), 105);
        assert!(commitment.created_at_secs == 1000, 106);
        assert!(!commitment.revealed, 107);
        assert!(commitment.thesis == string::utf8(b"Consumer-heavy arenas will absorb the next wave."), 110);
        assert!(commitment.evidence == string::utf8(b"Bridge volume, sponsor incentives, and creator traffic all cluster."), 111);

        timestamp::update_global_time_for_test_secs(1015);

        reveal(&owner, 0);

        let revealed_option = get_commitment(0);
        let revealed = option::extract(&mut revealed_option);
        assert!(revealed.revealed, 108);
        assert!(option::contains(&revealed.revealed_at_secs, &1015), 109);

        let rep_option = get_reputation(@0xcafe);
        assert!(option::is_some(&rep_option), 112);
        let rep = option::extract(&mut rep_option);
        assert!(rep.owner == @0xcafe, 113);
        assert!(rep.reveals == 1, 114);
        assert!(rep.score == 28, 115);
    }

    #[test(owner = @0xcafe)]
    fun test_reputation_accumulates(owner: signer) acquires SignalArena {
        timestamp::set_time_has_started_for_testing(&owner);
        timestamp::update_global_time_for_test_secs(1000);

        init_module(&owner);

        commit(
            &owner,
            string::utf8(b"macro-rift"),
            string::utf8(b"hybrid"),
            string::utf8(b"0xhash1"),
            80,
            string::utf8(b"First thesis"),
            string::utf8(b"First evidence"),
            string::utf8(b"salt1"),
        );

        commit(
            &owner,
            string::utf8(b"governor-shadow"),
            string::utf8(b"agent"),
            string::utf8(b"0xhash2"),
            90,
            string::utf8(b"Second thesis"),
            string::utf8(b"Second evidence"),
            string::utf8(b"salt2"),
        );

        reveal(&owner, 0);
        let rep1 = option::borrow(&get_reputation(@0xcafe));
        assert!(rep1.score == 29, 200);
        assert!(rep1.reveals == 1, 201);

        reveal(&owner, 1);
        let rep2 = option::borrow(&get_reputation(@0xcafe));
        assert!(rep2.score == 62, 202);
        assert!(rep2.reveals == 2, 203);

        let all_reps = list_reputations();
        assert!(vector::length(&all_reps) == 1, 204);
    }

    #[test(owner = @0xcafe)]
    fun test_arena_fee_config(owner: signer) acquires SignalArena {
        timestamp::set_time_has_started_for_testing(&owner);
        init_module(&owner);

        let fees = list_arena_fee_configs();
        assert!(vector::length(&fees) == 0, 300);

        set_arena_fee(
            &owner,
            string::utf8(b"macro-rift"),
            32,
            string::utf8(b"uinit"),
        );

        let fees2 = list_arena_fee_configs();
        assert!(vector::length(&fees2) == 1, 301);

        let fee_config = vector::borrow(&fees2, 0);
        assert!(fee_config.arena_id == string::utf8(b"macro-rift"), 302);
        assert!(fee_config.amount == 32, 303);
        assert!(fee_config.denom == string::utf8(b"uinit"), 304);

        let specific = get_arena_fee_config(string::utf8(b"macro-rift"));
        assert!(option::is_some(&specific), 305);

        update_arena_fee(
            &owner,
            string::utf8(b"macro-rift"),
            55,
            string::utf8(b"uinit"),
        );

        let updated = get_arena_fee_config(string::utf8(b"macro-rift"));
        let config = option::borrow(&updated);
        assert!(config.amount == 55, 306);

        remove_arena_fee(&owner, string::utf8(b"macro-rift"));
        let removed = get_arena_fee_config(string::utf8(b"macro-rift"));
        assert!(option::is_none(&removed), 307);
    }

    #[test(owner = @0xcafe)]
    fun test_free_commit_without_fee(owner: signer) acquires SignalArena {
        timestamp::set_time_has_started_for_testing(&owner);
        timestamp::update_global_time_for_test_secs(1000);

        init_module(&owner);

        let none_fee = get_arena_fee_config(string::utf8(b"macro-rift"));
        assert!(option::is_none(&none_fee), 400);

        commit(
            &owner,
            string::utf8(b"macro-rift"),
            string::utf8(b"human"),
            string::utf8(b"0xfree"),
            50,
            string::utf8(b"Free commit thesis"),
            string::utf8(b"Free commit evidence"),
            string::utf8(b"freeSalt"),
        );

        assert!(commitment_count() == 1, 401);

        reveal(&owner, 0);
        let rep = option::borrow(&get_reputation(@0xcafe));
        assert!(rep.score == 20, 402);
        assert!(rep.reveals == 1, 403);
    }
}
