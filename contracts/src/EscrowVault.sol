// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {JobRegistry} from "./JobRegistry.sol";
import {ArbiterPool} from "./ArbiterPool.sol";

/// @title EscrowVault
/// @notice Holds cUSD bounties for all jobs. Releases funds via:
///         1. Authorized AI agent (normal evaluation)
///         2. ArbiterPool decision (dispute deadlock)
contract EscrowVault {
    IERC20 public immutable cUSD;
    JobRegistry public immutable jobRegistry;
    ArbiterPool public immutable arbiterPool;
    address public immutable owner;
    address public authorizedAgent;

    // jobId => locked amount
    mapping(bytes32 => uint256) public lockedFunds;

    // disputeId => jobId
    mapping(bytes32 => bytes32) public disputeToJob;

    event FundsLocked(bytes32 indexed jobId, uint256 amount);
    event FundsReleased(bytes32 indexed jobId, address indexed recipient, uint256 amount);
    event FundsRefunded(bytes32 indexed jobId, address indexed client, uint256 amount);
    event DisputeEscalated(bytes32 indexed jobId, bytes32 indexed disputeId);
    event AgentUpdated(address indexed agent);

    error Unauthorized();
    error AlreadyLocked();
    error NoFundsLocked();
    /// @notice Thrown when job status is not valid for the requested vault operation.
    ///         releaseFunds requires SUBMITTED or COMPLETED.
    ///         refundFunds requires SUBMITTED, COMPLETED, or DISPUTED.
    ///         refundOnCancel requires CANCELLED.
    error JobNotInExpectedState();
    error ZeroAmount();

    modifier onlyAgent() {
        if (msg.sender != authorizedAgent) revert Unauthorized();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(address _cUSD, address _jobRegistry, address _arbiterPool, address _owner) {
        cUSD = IERC20(_cUSD);
        jobRegistry = JobRegistry(_jobRegistry);
        arbiterPool = ArbiterPool(_arbiterPool);
        owner = _owner;
    }

    function setAuthorizedAgent(address _agent) external onlyOwner {
        authorizedAgent = _agent;
        emit AgentUpdated(_agent);
    }

    /// @notice Lock funds for a job. Called by JobRegistry when a job is posted.
    function lockFunds(bytes32 jobId, uint256 amount) external {
        if (msg.sender != address(jobRegistry)) revert Unauthorized();
        if (amount == 0) revert ZeroAmount();
        if (lockedFunds[jobId] != 0) revert AlreadyLocked();

        lockedFunds[jobId] = amount;
        emit FundsLocked(jobId, amount);
    }

    /// @notice Release funds to freelancer. Called by agent on successful evaluation.
    /// @dev Accepts both SUBMITTED and COMPLETED status to handle any agent call ordering.
    ///      The agent may call markCompleted before or after releaseFunds; both orderings
    ///      must succeed so funds are never permanently locked.
    function releaseFunds(bytes32 jobId) external onlyAgent {
        uint256 amount = lockedFunds[jobId];
        if (amount == 0) revert NoFundsLocked();

        JobRegistry.Job memory job = jobRegistry.getJob(jobId);
        if (
            job.status != JobRegistry.JobStatus.SUBMITTED &&
            job.status != JobRegistry.JobStatus.COMPLETED
        ) revert JobNotInExpectedState();

        lockedFunds[jobId] = 0;
        cUSD.transfer(job.freelancer, amount);

        emit FundsReleased(jobId, job.freelancer, amount);
    }

    /// @notice Refund bounty to client. Called by agent on failed evaluation.
    /// @dev Accepts SUBMITTED, COMPLETED, or DISPUTED status to handle all agent call orderings.
    function refundFunds(bytes32 jobId) external onlyAgent {
        uint256 amount = lockedFunds[jobId];
        if (amount == 0) revert NoFundsLocked();

        JobRegistry.Job memory job = jobRegistry.getJob(jobId);
        if (
            job.status != JobRegistry.JobStatus.SUBMITTED &&
            job.status != JobRegistry.JobStatus.COMPLETED &&
            job.status != JobRegistry.JobStatus.DISPUTED
        ) revert JobNotInExpectedState();

        lockedFunds[jobId] = 0;
        cUSD.transfer(job.client, amount);

        emit FundsRefunded(jobId, job.client, amount);
    }

    /// @notice Refund bounty to client when job is cancelled by client.
    /// @dev Only callable by JobRegistry during cancelJob operation.
    /// @param jobId The ID of the job being cancelled.
    /// @custom:access Only callable by JobRegistry contract.
    function refundOnCancel(bytes32 jobId) external {
        if (msg.sender != address(jobRegistry)) revert Unauthorized();

        uint256 amount = lockedFunds[jobId];
        if (amount == 0) revert NoFundsLocked();

        JobRegistry.Job memory job = jobRegistry.getJob(jobId);
        if (job.status != JobRegistry.JobStatus.CANCELLED) revert JobNotInExpectedState();

        lockedFunds[jobId] = 0;
        cUSD.transfer(job.client, amount);

        emit FundsRefunded(jobId, job.client, amount);
    }

    /// @notice Escalate to arbiter pool when AI cannot resolve dispute.
    /// @dev disputeId is derived from jobId and block.timestamp. See issue #10 for
    ///      collision risk when two disputes are opened in the same block.
    function escalateToArbiters(bytes32 jobId) external onlyAgent returns (bytes32 disputeId) {
        uint256 amount = lockedFunds[jobId];
        if (amount == 0) revert NoFundsLocked();

        disputeId = keccak256(abi.encodePacked(jobId, block.timestamp));
        disputeToJob[disputeId] = jobId;

        arbiterPool.openDispute(disputeId, jobId);

        emit DisputeEscalated(jobId, disputeId);
    }

    /// @notice Called by ArbiterPool after voting concludes to execute the decision.
    /// @dev Transfers funds to freelancer on RELEASED outcome, to client on REFUNDED outcome.
    ///      Clears lockedFunds before transfer to prevent re-entrancy.
    function executeArbiterDecision(bytes32 disputeId) external {
        if (msg.sender != address(arbiterPool)) revert Unauthorized();

        bytes32 jobId = disputeToJob[disputeId];
        uint256 amount = lockedFunds[jobId];
        if (amount == 0) revert NoFundsLocked();

        ArbiterPool.DisputeOutcome outcome = arbiterPool.getDisputeOutcome(disputeId);
        JobRegistry.Job memory job = jobRegistry.getJob(jobId);

        lockedFunds[jobId] = 0;

        if (outcome == ArbiterPool.DisputeOutcome.RELEASED) {
            cUSD.transfer(job.freelancer, amount);
            emit FundsReleased(jobId, job.freelancer, amount);
        } else {
            cUSD.transfer(job.client, amount);
            emit FundsRefunded(jobId, job.client, amount);
        }
    }

    function getLockedAmount(bytes32 jobId) external view returns (uint256) {
        return lockedFunds[jobId];
    }
}
