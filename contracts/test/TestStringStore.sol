// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract TestStringStore {
    string public storedString;

    event StringChanged(address indexed caller, string oldValue, string newValue);

    constructor() {
        storedString = "Hello, DAO!";
    }

    function setString(string memory newValue) public {
        string memory oldValue = storedString;
        storedString = newValue;
        emit StringChanged(msg.sender, oldValue, newValue);
    }
}
