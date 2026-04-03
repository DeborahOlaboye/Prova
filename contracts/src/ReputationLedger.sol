// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ReputationLedger
/// @notice Immutable on-chain reputation scores for freelancers.
///         Scores are portable — any protocol can query a freelancer's history.
contract ReputationLedger {
    struct Score {
        uint32 jobsCompleted;
        uint32 jobsDisputed;
        uint32 disputesWon;
        uint32 avgRating;       // 0–100, weighted average of client ratings
        uint256 totalEarned;    // cumulative cUSD earned (wei)
        uint40 memberSince;
    }

    address public immutable owner;
    address public authorizedAgent;

    mapping(address => Score) public scores;

    // Track rating count for weighted average
    mapping(address => uint32) internal _ratingCount;

    event CompletionRecorded(address indexed freelancer, bytes32 indexed jobId, uint32 clientRating, uint256 amountEarned);
    event DisputeOutcomeRecorded(address indexed freelancer, bytes32 indexed jobId, bool won);
    event AgentUpdated(address indexed agent);

    error Unauthorized();
    error InvalidRating();

    modifier onlyAgent() {
        if (msg.sender != authorizedAgent) revert Unauthorized();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(address _owner) {
        owner = _owner;
    }

    function setAuthorizedAgent(address _agent) external onlyOwner {
        authorizedAgent = _agent;
        emit AgentUpdated(_agent);
    }

    /// @notice Record a successful job completion.
    /// @param freelancer   Freelancer address
    /// @param jobId        Job identifier
    /// @param clientRating 1–5 star rating scaled to 0–100 (e.g. 5 stars = 100)
    /// @param amountEarned cUSD earned for this job (wei)
    function recordCompletion(
        address freelancer,
        bytes32 jobId,
        uint32 clientRating,
        uint256 amountEarned
    ) external onlyAgent {
        if (clientRating > 100) revert InvalidRating();

        Score storage s = scores[freelancer];

        if (s.memberSince == 0) {
            s.memberSince = uint40(block.timestamp);
        }

        // Weighted average rating
        uint32 count = _ratingCount[freelancer];
        s.avgRating = uint32((uint256(s.avgRating) * count + clientRating) / (count + 1));
        _ratingCount[freelancer] = count + 1;

        s.jobsCompleted++;
        s.totalEarned += amountEarned;

        emit CompletionRecorded(freelancer, jobId, clientRating, amountEarned);
    }

    /// @notice Record the outcome of a dispute.
    function recordDisputeOutcome(
        address freelancer,
        bytes32 jobId,
        bool won
    ) external onlyAgent {
        Score storage s = scores[freelancer];
        s.jobsDisputed++;
        if (won) s.disputesWon++;
        emit DisputeOutcomeRecorded(freelancer, jobId, won);
    }

    /// @notice Get a freelancer's score.
    function getScore(address freelancer) external view returns (Score memory) {
        return scores[freelancer];
    }

    /// @notice Calculate the composite reputation score (0–100).
    ///         completionRate×40 + disputeWinRate×20 + avgRating×25 + experienceScore×15
    function getCompositeScore(address freelancer) external view returns (uint256) {
        Score memory s = scores[freelancer];
        if (s.jobsCompleted == 0) return 0;

        uint256 completionBase = s.jobsCompleted + s.jobsDisputed;
        uint256 completionRate = completionBase == 0
            ? 0
            : (uint256(s.jobsCompleted) * 100) / completionBase;

        uint256 disputeWinRate = s.jobsDisputed == 0
            ? 100
            : (uint256(s.disputesWon) * 100) / s.jobsDisputed;

        // Experience: log2-like scale based on jobs completed, normalized to 0–100
        uint256 expScore = s.jobsCompleted >= 100
            ? 100
            : s.jobsCompleted;

        return (completionRate * 40 + disputeWinRate * 20 + uint256(s.avgRating) * 25 + expScore * 15) / 100;
    }
}
