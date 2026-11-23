// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title UniversityRegistry
/// @notice Allow-list of institutions permitted to anchor credential batches.
contract UniversityRegistry is Ownable {
    struct University {
        string name;
        bool active;
    }

    mapping(address => University) private _universities;

    event UniversityRegistered(address indexed account, string name);
    event UniversityStatusChanged(address indexed account, bool active);

    constructor() Ownable(msg.sender) {}

    function registerUniversity(address account, string calldata name) external onlyOwner {
        require(account != address(0), "UniversityRegistry: zero address");
        require(bytes(name).length > 0, "UniversityRegistry: empty name");
        _universities[account] = University(name, true);
        emit UniversityRegistered(account, name);
    }

    function setUniversityActive(address account, bool active) external onlyOwner {
        require(bytes(_universities[account].name).length > 0, "UniversityRegistry: unknown university");
        _universities[account].active = active;
        emit UniversityStatusChanged(account, active);
    }

    function isUniversity(address account) external view returns (bool) {
        return _universities[account].active;
    }

    function nameOf(address account) external view returns (string memory) {
        return _universities[account].name;
    }
}
