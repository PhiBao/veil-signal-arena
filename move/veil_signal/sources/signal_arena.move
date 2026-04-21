module veil::signal_arena {
    use std::error;
    use std::option;
    use std::option::Option;
    use std::signer;
    use std::string::String;
    use std::timestamp;
    use std::vector;

    const E_STATE_MISSING: u64 = 1;
    const E_ALREADY_INITIALIZED: u64 = 2;
    const E_COMMITMENT_NOT_FOUND: u64 = 3;
    const E_ALREADY_REVEALED: u64 = 4;
    const E_INVALID_CONFIDENCE: u64 = 5;
    const E_NOT_COMMITMENT_OWNER: u64 = 6;
    const E_INVALID_MODULE_OWNER: u64 = 7;

    /// Global commitment ledger backing the on-chain Veil runtime.
    /// Frontends can query the full arena state directly from this module without
    /// relying on a local API as the source of truth.
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
        thesis: Option<String>,
        evidence: Option<String>,
    }

    struct SignalArena has key {
        next_commitment_id: u64,
        commitments: vector<Commitment>,
    }

    fun init_module(account: &signer) {
        let owner = signer::address_of(account);
        assert!(owner == @veil, error::permission_denied(E_INVALID_MODULE_OWNER));
        assert!(!exists<SignalArena>(owner), error::already_exists(E_ALREADY_INITIALIZED));

        move_to(account, SignalArena {
            next_commitment_id: 0,
            commitments: vector::empty<Commitment>(),
        });
    }

    public entry fun commit(
        account: &signer,
        arena_id: String,
        route_mode: String,
        commitment_hash: String,
        confidence: u64,
    ) acquires SignalArena {
        assert!(confidence <= 100, error::invalid_argument(E_INVALID_CONFIDENCE));
        assert!(exists<SignalArena>(@veil), error::not_found(E_STATE_MISSING));

        let arena = borrow_global_mut<SignalArena>(@veil);
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
            thesis: option::none<String>(),
            evidence: option::none<String>(),
        });
    }

    public entry fun reveal(
        account: &signer,
        commitment_id: u64,
        thesis: String,
        evidence: String,
    ) acquires SignalArena {
        assert!(exists<SignalArena>(@veil), error::not_found(E_STATE_MISSING));

        let arena = borrow_global_mut<SignalArena>(@veil);
        let commitment = borrow_commitment_mut(&mut arena.commitments, commitment_id);
        assert!(commitment.owner == signer::address_of(account), error::permission_denied(E_NOT_COMMITMENT_OWNER));
        assert!(!commitment.revealed, error::already_exists(E_ALREADY_REVEALED));

        commitment.revealed = true;
        commitment.revealed_at_secs = option::some(timestamp::now_seconds());
        commitment.thesis = option::some(thesis);
        commitment.evidence = option::some(evidence);
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
        );

        let commitments = list_commitments();
        let commitment = vector::borrow(&commitments, 0);

        assert!(commitment_count() == 1, 103);
        assert!(commitment.owner == @0xcafe, 104);
        assert!(commitment.route_mode == string::utf8(b"hybrid"), 105);
        assert!(commitment.created_at_secs == 1000, 106);
        assert!(!commitment.revealed, 107);

        timestamp::update_global_time_for_test_secs(1015);

        reveal(
            &owner,
            0,
            string::utf8(b"Consumer-heavy arenas will absorb the next wave of INIT activity."),
            string::utf8(b"Bridge volume, sponsor incentives, and creator traffic all cluster in the same direction."),
        );

        let revealed_option = get_commitment(0);
        let revealed = option::extract(&mut revealed_option);
        assert!(revealed.revealed, 108);
        assert!(option::contains(&revealed.revealed_at_secs, &1015), 109);
    }
}
