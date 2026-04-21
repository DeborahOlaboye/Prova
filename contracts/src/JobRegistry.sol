// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "forge-std/interfaces/IERC20.sol";

/// @title JobRegistry
/// @notice Core job lifecycle manager for Prova.
///         Clients post jobs with cUSD bounties, freelancers accept and submit work.
contract JobRegistry {
    enum JobStatus {
        OPEN,
        IN_PROGRESS,
        SUBMITTED,
        COMPLETED,
        DISPUTED,
        REFUNDED,
        CANCELLED
    }

    struct Job {
        bytes32 jobId;
        address client;
        address freelancer;       // address(0) until accepted
        string title;
        string criteriaIPFSHash;  // acceptance criteria stored on IPFS
        string deliverableIPFSHash; // set by freelancer on submission
        uint256 bounty;           // cUSD in wei
        uint40 deadline;
        uint40 postedAt;
        JobStatus status;
    }

    IERC20 public immutable cUSD;
    address public immutable owner;
    address public escrowVault;
    address public authorizedAgent;

    mapping(bytes32 => Job) private _jobs;

    // client => jobIds
    mapping(address => bytes32[]) public clientJobs;
    // freelancer => jobIds
    mapping(address => bytes32[]) public freelancerJobs;

    bytes32[] public openJobIds;

    uint256 public constant MIN_BOUNTY = 1e13; // 0.00001 cUSD minimum

    event JobPosted(bytes32 indexed jobId, address indexed client, uint256 bounty, uint40 deadline);
    event JobAccepted(bytes32 indexed jobId, address indexed freelancer);
    event WorkSubmitted(bytes32 indexed jobId, string deliverableIPFSHash);
    event JobCompleted(bytes32 indexed jobId);
    event JobDisputed(bytes32 indexed jobId, address indexed raisedBy);
    event JobRefunded(bytes32 indexed jobId);
    event JobCancelled(bytes32 indexed jobId);
    event AgentUpdated(address indexed agent);
    event VaultUpdated(address indexed vault);

    error Unauthorized();
    error JobNotOpen();
    error JobNotInProgress();
    error JobNotSubmitted();
    error JobNotActive();
    error BountyTooLow();
    error DeadlinePassed();
    error AlreadyAccepted();
    error InvalidDeadline();
    error VaultAlreadySet();
    /// @notice Thrown when job title is empty
    error EmptyTitle();
    /// @notice Thrown when criteria IPFS hash is empty
    error EmptyCriteria();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyAgent() {
        if (msg.sender != authorizedAgent) revert Unauthorized();
        _;
    }

    constructor(address _cUSD, address _owner) {
        cUSD = IERC20(_cUSD);
        owner = _owner;
    }

    function setEscrowVault(address _vault) external onlyOwner {
        if (escrowVault != address(0)) revert VaultAlreadySet();
        escrowVault = _vault;
        emit VaultUpdated(_vault);
    }

    function setAuthorizedAgent(address _agent) external onlyOwner {
        authorizedAgent = _agent;
        emit AgentUpdated(_agent);
    }

    /// @notice Post a new job. Bounty is locked in EscrowVault immediately.
    /// @dev Validates that title and criteriaIPFSHash are non-empty strings.
    function postJob(
        string calldata title,
        string calldata criteriaIPFSHash,
        uint256 bounty,
        uint40 deadline
    ) external returns (bytes32 jobId) {
        if (bounty < MIN_BOUNTY) revert BountyTooLow();
        if (deadline <= block.timestamp) revert InvalidDeadline();
        // Convert strings to bytes to check length - prevents empty string inputs
        if (bytes(title).length == 0) revert EmptyTitle();
        if (bytes(criteriaIPFSHash).length == 0) revert EmptyCriteria();

        jobId = keccak256(
            abi.encodePacked(msg.sender, title, block.timestamp, bounty)
        );

        _jobs[jobId] = Job({
            jobId: jobId,
            client: msg.sender,
            freelancer: address(0),
            title: title,
            criteriaIPFSHash: criteriaIPFSHash,
            deliverableIPFSHash: "",
            bounty: bounty,
            deadline: deadline,
            postedAt: uint40(block.timestamp),
            status: JobStatus.OPEN
        });

        clientJobs[msg.sender].push(jobId);
        openJobIds.push(jobId);

        // Transfer bounty to escrow
        cUSD.transferFrom(msg.sender, escrowVault, bounty);

        // Notify vault to track the lock
        (bool ok,) = escrowVault.call(
            abi.encodeWithSignature("lockFunds(bytes32,uint256)", jobId, bounty)
        );
        require(ok, "lockFunds failed");

        emit JobPosted(jobId, msg.sender, bounty, deadline);
    }

    /// @notice Freelancer accepts an open job.
    function acceptJob(bytes32 jobId) external {
        Job storage j = _jobs[jobId];
        if (j.status != JobStatus.OPEN) revert JobNotOpen();
        if (block.timestamp > j.deadline) revert DeadlinePassed();

        j.freelancer = msg.sender;
        j.status = JobStatus.IN_PROGRESS;

        freelancerJobs[msg.sender].push(jobId);
        _removeFromOpenJobs(jobId);

        emit JobAccepted(jobId, msg.sender);
    }

    /// @notice Freelancer submits completed work.
    function submitWork(bytes32 jobId, string calldata deliverableIPFSHash) external {
        Job storage j = _jobs[jobId];
        if (j.status != JobStatus.IN_PROGRESS) revert JobNotInProgress();
        if (j.freelancer != msg.sender) revert Unauthorized();

        j.deliverableIPFSHash = deliverableIPFSHash;
        j.status = JobStatus.SUBMITTED;

        emit WorkSubmitted(jobId, deliverableIPFSHash);
    }

    /// @notice Mark job as completed. Called by agent after successful evaluation.
    function markCompleted(bytes32 jobId) external onlyAgent {
        Job storage j = _jobs[jobId];
        if (j.status != JobStatus.SUBMITTED) revert JobNotSubmitted();
        j.status = JobStatus.COMPLETED;
        emit JobCompleted(jobId);
    }

    /// @notice Mark job as disputed. Called by agent when confidence is low.
    function markDisputed(bytes32 jobId) external onlyAgent {
        Job storage j = _jobs[jobId];
        if (j.status != JobStatus.SUBMITTED) revert JobNotSubmitted();
        j.status = JobStatus.DISPUTED;
        emit JobDisputed(jobId, msg.sender);
    }

    /// @notice Mark job as refunded. Called by agent when work fails evaluation.
    function markRefunded(bytes32 jobId) external onlyAgent {
        Job storage j = _jobs[jobId];
        if (j.status != JobStatus.SUBMITTED && j.status != JobStatus.DISPUTED) {
            revert JobNotActive();
        }
        j.status = JobStatus.REFUNDED;
        emit JobRefunded(jobId);
    }

    /// @notice Client cancels an open job and receives a full refund of the bounty.
    /// @dev Only the client who posted the job can cancel it. Refunds are processed through EscrowVault.
    /// @param jobId The ID of the job to cancel.
    function cancelJob(bytes32 jobId) external {
        Job storage j = _jobs[jobId];
        if (j.client != msg.sender) revert Unauthorized();
        if (j.status != JobStatus.OPEN) revert JobNotOpen();

        j.status = JobStatus.CANCELLED;
        _removeFromOpenJobs(jobId);

        // Refund the bounty to the client via EscrowVault
        // This ensures locked funds are returned when client cancels
        (bool ok,) = escrowVault.call(
            abi.encodeWithSignature("refundOnCancel(bytes32)", jobId)
        );
        require(ok, "refundOnCancel failed");

        emit JobCancelled(jobId);
    }

    function getJob(bytes32 jobId) external view returns (Job memory) {
        return _jobs[jobId];
    }

    function getClientJobs(address client) external view returns (bytes32[] memory) {
        return clientJobs[client];
    }

    function getFreelancerJobs(address freelancer) external view returns (bytes32[] memory) {
        return freelancerJobs[freelancer];
    }

    function getOpenJobCount() external view returns (uint256) {
        return openJobIds.length;
    }

    function _removeFromOpenJobs(bytes32 jobId) internal {
        for (uint256 i = 0; i < openJobIds.length; i++) {
            if (openJobIds[i] == jobId) {
                openJobIds[i] = openJobIds[openJobIds.length - 1];
                openJobIds.pop();
                break;
            }
        }
    }
}
