// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "forge-std/interfaces/IERC20.sol";

/// @title ArbiterPool
/// @notice Staked human arbiters who vote on deadlocked disputes.
///         Arbiters stake cUSD to join, vote on disputes, and earn a fee per resolved case.
contract ArbiterPool {
    IERC20 public immutable cUSD;
    address public immutable owner;
    address public escrowVault; // set after deploy

    uint256 public constant STAKE_AMOUNT = 10e18;  // 10 cUSD to become arbiter
    uint256 public constant ARBITER_FEE  = 2e18;   // 2 cUSD fee per resolved dispute
    uint256 public constant UNSTAKE_COOLDOWN = 7 days;

    enum Vote { NONE, RELEASE, REFUND }
    enum DisputeOutcome { PENDING, RELEASED, REFUNDED }

    struct Arbiter {
        uint256 stakedAt;
        uint256 unstakeRequestedAt; // 0 if no request pending
        bool active;
    }

    struct Dispute {
        bytes32 jobId;
        address[] selectedArbiters; // randomly selected subset
        mapping(address => Vote) votes;
        uint8 releaseVotes;
        uint8 refundVotes;
        bool resolved;
        DisputeOutcome outcome;
        uint40 createdAt;
    }

    mapping(address => Arbiter) public arbiters;
    address[] public arbiterList;

    // disputeId => Dispute
    mapping(bytes32 => Dispute) public disputes;

    // arbiter => unclaimed fees
    mapping(address => uint256) public pendingFees;

    event ArbiterJoined(address indexed arbiter);
    event ArbiterUnstakeRequested(address indexed arbiter);
    event ArbiterUnstaked(address indexed arbiter);
    event DisputeOpened(bytes32 indexed disputeId, bytes32 indexed jobId);
    event VoteCast(bytes32 indexed disputeId, address indexed arbiter, Vote vote);
    event DisputeResolved(bytes32 indexed disputeId, DisputeOutcome outcome);
    event FeeClaimed(address indexed arbiter, uint256 amount);

    error Unauthorized();
    error AlreadyArbiter();
    error NotArbiter();
    error NotSelectedArbiter();
    error AlreadyVoted();
    error DisputeAlreadyResolved();
    error CooldownNotMet();
    error NoFeesToClaim();
    error InsufficientArbiters();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyVault() {
        if (msg.sender != escrowVault) revert Unauthorized();
        _;
    }

    constructor(address _cUSD, address _owner) {
        cUSD = IERC20(_cUSD);
        owner = _owner;
    }

    function setEscrowVault(address _vault) external onlyOwner {
        escrowVault = _vault;
    }

    /// @notice Stake cUSD to become an arbiter.
    function stake() external {
        if (arbiters[msg.sender].active) revert AlreadyArbiter();

        cUSD.transferFrom(msg.sender, address(this), STAKE_AMOUNT);

        arbiters[msg.sender] = Arbiter({
            stakedAt: block.timestamp,
            unstakeRequestedAt: 0,
            active: true
        });

        arbiterList.push(msg.sender);
        emit ArbiterJoined(msg.sender);
    }

    /// @notice Request to unstake. Enforces 7-day cooldown.
    function requestUnstake() external {
        Arbiter storage a = arbiters[msg.sender];
        if (!a.active) revert NotArbiter();
        a.unstakeRequestedAt = block.timestamp;
        emit ArbiterUnstakeRequested(msg.sender);
    }

    /// @notice Complete unstake after cooldown.
    function unstake() external {
        Arbiter storage a = arbiters[msg.sender];
        if (!a.active) revert NotArbiter();
        if (a.unstakeRequestedAt == 0 || block.timestamp < a.unstakeRequestedAt + UNSTAKE_COOLDOWN) {
            revert CooldownNotMet();
        }

        a.active = false;
        cUSD.transfer(msg.sender, STAKE_AMOUNT);
        emit ArbiterUnstaked(msg.sender);
    }

    /// @notice Called by EscrowVault to open a dispute and select arbiters.
    function openDispute(bytes32 disputeId, bytes32 jobId) external onlyVault returns (address[] memory selected) {
        uint256 activeCount = _countActiveArbiters();
        if (activeCount < 3) revert InsufficientArbiters();

        Dispute storage d = disputes[disputeId];
        d.jobId = jobId;
        d.createdAt = uint40(block.timestamp);

        // Select up to 3 arbiters pseudo-randomly
        selected = _selectArbiters(disputeId, activeCount);
        d.selectedArbiters = selected;

        emit DisputeOpened(disputeId, jobId);
    }

    /// @notice Submit a vote on a dispute. Only selected arbiters can vote.
    function submitVote(bytes32 disputeId, Vote vote) external {
        Dispute storage d = disputes[disputeId];
        if (d.resolved) revert DisputeAlreadyResolved();
        if (!_isSelected(d, msg.sender)) revert NotSelectedArbiter();
        if (d.votes[msg.sender] != Vote.NONE) revert AlreadyVoted();
        if (vote == Vote.NONE) revert Unauthorized();

        d.votes[msg.sender] = vote;
        if (vote == Vote.RELEASE) d.releaseVotes++;
        else d.refundVotes++;

        emit VoteCast(disputeId, msg.sender, vote);

        // Resolve when majority reached (2 of 3)
        if (d.releaseVotes >= 2 || d.refundVotes >= 2) {
            _resolveDispute(disputeId);
        }
    }

    /// @notice Arbiter claims their accumulated fees.
    function claimFee() external {
        uint256 fee = pendingFees[msg.sender];
        if (fee == 0) revert NoFeesToClaim();
        pendingFees[msg.sender] = 0;
        cUSD.transfer(msg.sender, fee);
        emit FeeClaimed(msg.sender, fee);
    }

    function getDisputeOutcome(bytes32 disputeId) external view returns (DisputeOutcome) {
        return disputes[disputeId].outcome;
    }

    function isDisputed(bytes32 disputeId) external view returns (bool) {
        return disputes[disputeId].createdAt != 0;
    }

    function activeArbiterCount() external view returns (uint256) {
        return _countActiveArbiters();
    }

    // --- internals ---

    function _resolveDispute(bytes32 disputeId) internal {
        Dispute storage d = disputes[disputeId];
        d.resolved = true;
        d.outcome = d.releaseVotes >= 2 ? DisputeOutcome.RELEASED : DisputeOutcome.REFUNDED;

        // Distribute fees to selected arbiters who voted
        for (uint256 i = 0; i < d.selectedArbiters.length; i++) {
            address a = d.selectedArbiters[i];
            if (d.votes[a] != Vote.NONE) {
                pendingFees[a] += ARBITER_FEE;
            }
        }

        emit DisputeResolved(disputeId, d.outcome);
    }

    function _countActiveArbiters() internal view returns (uint256 count) {
        for (uint256 i = 0; i < arbiterList.length; i++) {
            if (arbiters[arbiterList[i]].active) count++;
        }
    }

    function _selectArbiters(bytes32 seed, uint256 activeCount) internal view returns (address[] memory selected) {
        uint256 selectCount = activeCount >= 3 ? 3 : activeCount;
        selected = new address[](selectCount);
        uint256 found;
        uint256 idx = uint256(keccak256(abi.encodePacked(seed, block.timestamp))) % arbiterList.length;

        for (uint256 i = 0; i < arbiterList.length && found < selectCount; i++) {
            address candidate = arbiterList[(idx + i) % arbiterList.length];
            if (arbiters[candidate].active) {
                selected[found++] = candidate;
            }
        }
    }

    function _isSelected(Dispute storage d, address arbiter) internal view returns (bool) {
        for (uint256 i = 0; i < d.selectedArbiters.length; i++) {
            if (d.selectedArbiters[i] == arbiter) return true;
        }
        return false;
    }
}
