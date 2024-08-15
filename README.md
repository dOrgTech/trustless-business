Trustless Business

andrei@dorg.tech



Business arrangements constitute the driving force of our civilization and require a trusted system of incentives. Historically, our national and international economic frameworks have provided this incentive system. The following describes an alternative to these frameworks, made possible by decentralized technology.

The Wider Context. Since the conceptualization of consensus-driven digital networks, it became obvious that trust can be diffused and encoded within a network, negating the need for centralized intermediaries. Distributed equilibrium logic can now ensure the authenticity and execution integrity of transactions, resulting in self-enforcing agreements. This not only redefines the transactional trust architecture but also extends to the broader economic sphere, enabling us to engineer a more robust way of organizing business. And since the economy serves as the linchpin around which our society orbits, transitioning to a decentralized economic framework holds the promise of overhauling our governance systems as well. By supplanting centralized mechanisms with transparent, consensus-driven networks, we open the door to governance models that inherently foster an otherwise elusive level of auditability and fairness, placing decision-making closer to the ground and thus empowering individuals and communities. Furthermore, as we steer into the age of automation and the competitive edge of human labor dwindles, a decentralized governance mechanism can enable the public at large to maintain its economic relevance, by allowing anyone and everyone to become a shareholder of AI services. 

# Proposed Solution

Let us consider the workflow of an arrangement between 2 parties which we will call the Client and the Contractor. These can be two individuals, two companies, or - our recommended case - two decentralized autonomous organizations, and they are identified in this framework by their wallet or contract address. The roles of these two parties is that one is providing the payment (Client) and the other is receiving it (Contractor) upon successful delivery of a product or service. To mediate a potential dispute that may arise, the Project also includes a third party called the Arbiter, which can also be either an individual or an organization. The viability of this dispute resolution mechanism is predicated upon the Arbiter’s incentive to mediate disputes in a way that is aligned with the reason and morals of the public, thus earning the kind of reputation that is likely to lead to more lucrative arbitration opportunities. When agreeing to cooperate, both Client and Contractor need to stake for the duration of their engagement half of the arbitration fee, which is to be paid to the Arbiter in the event of a dispute. 
At the core of a business arrangement in this framework is the Project, as a logical entity. This is a piece of smart contract code that can be deployed by calling a function on the Economy contract. 
The Project can be described by describing its functions, its states, and its escrow functionality.

## The Functions of a Project

![stages](https://i.ibb.co/DwpHPkr/stages2.png)

These are the available interactions that the Project is able to accept at different stages of its life cycle, with their respective parameters, and access restrictions:

Origination - Open. This is a constructor function. 
Access: Anyone
Parameters:
Author <Address> - automatically assigned as the address of the caller
External link to requirements doc <String> - a github raw or google drive url, or any other centralized resource that can produce the content in plain text. 

Origination - Set Parties. This is the second constructor function. 
Access: Anyone
Parameters:
Author  <Address> - automatically assigned as the address of the caller
External link to requirements doc <String> - same as per Open Origination call
Contractor <Address>
Arbiter <Address>
Hash of requirements doc <String> - This is an alphanumeric string created by parsing the content of the requirements doc through a conventional hashing function. If the author is creating the project using a helper UI application like Trustless.Business, the hash will be automatically generated and submitted to the chain. 
Value: The caller (Author) will attach tokens in the amount of half the arbitration fee. The fee amount is dynamically set by the stakeholders through the consensus, on the parent Economy contract.

Set Parties. Available only within a project instantiated with the Open Origination constructor.
Access: Author
Parameters:
Contractor <Address>
Arbiter <Address>
Value: Half of Arbiter fee.

Sign Contract. Available only within a project with both parties defined and where only one of the parties has staked their half of the arbitration fee. 
Access: Party that is not Author
Parameters: (None)
Value: Half of Arbiter fee.

Send Funds to Project. Available only when the Project is in stage `open` or `pending`. 
Access: Anyone
Parameters: 
Token <Integer> - The index of an element in the array of accepted tokens
Amount <Integer> - The amount expressed in the lowest allowed subdivision

Release Funds to Contractor. Available only for non-disputed Projects with both parties set. 
Access: Client
Parameters: (None)

Withdraw. Available only in  `open`, `pending` or `closed` stage.
Access: Contributor (any address )
Parameters: (None)

Initiate Dispute. Available only in  `ongoing`, stage.. 
Access: Contractor or 70% of Backers.
Parameters: (None)

Arbitrate. Available only in stage `dispute`. 
Access: Arbiter
Parameters: 
Award to contractor <Integer> -  Percentage of funds held in escrow to be allocated to the Contractor. Minimum is zero and maximum is 100. Does not support 
Award to contractor <String> 


## The Stages of a Project

The address that deploys the Project on-chain is given the role of Author. Typically, the Author of the Project is the same as the Client, and the Project is the result of a need/interest of theirs. However, the framework does not enforce this paradigm. Depending on whether or not the Contractor is specified at origination, the first stage of the project can be:

Open. This is a Project instantiated by the Client by calling the constructor function Origination - Open. 
Available functions: 
Send Funds to Project
Set Parties
Withdraw

Pending. A Project is in a pending stage when only one of the parties has staked their half of the arbitration fee, but both parties are specified by the project author, either through the Set Parties constructor function, or after calling the Set Other Party function independently.
Available functions: 
Sign
Withdraw/Reimburse

Ongoing. This stage is set when both parties have staked their half of the arbitration fee and none of the parties have exercised their right to initiate a dispute. It's the stage at which the Contractor is supposed to perform the service that is stipulated in the requirements document.
Available functions: 
Send Funds to Project
Release Funds to Contractor
Initiate Dispute

Dispute. This stage is set after one of the parties of an Ongoing Project calls the Initiate Dispute function. The Client may initiate the dispute if they consider that the Contractor has not delivered according to the requirements. The Contractor may also initiate the dispute if they consider that the funds should have been released to them. At this point the Arbiter can step in and decide how to split the funds held in the Project escrow between the two parties.  
Available functions: 
Arbitrate

Expired. A dispute must be resolved within a specific interval of time. If the Arbiter fails to rule before that time window is over, the funds held in escrow can be returned to the project backers.
Available functions: 
Return Funds to Project Backers

Closed. Once the funds held in escrow have been released to either party (or to both through arbitration). The Project will not accept any further interactions.
Available functions: (None)

## The Escrow Functionality

A key enabling factor of the trustless workflow described here is the ability to hold funds in escrow in a publicly readable manner. This is achieved through the use of a few data structures:

acceptedTokens is an array of contract addresses that implement a token standard. By default, the Project is only able to accept payment in the native currency of the respective blockchain network, but the Contractor is able to receive payment in other tokens by calling the function Accept Payment Tokens to append this array. Once a token has been added to the array it cannot be removed, thus guaranteeing that its array index will always remain the same.

contributions is a mapping (list of key-value pairs), accounting for the usage of the Send Funds to Project function. 
The KEY represents the wallet/contract address of the contributor (caller of the function), which in EVM syntax is typically identified as msg.sender
The VALUE is a nested mapping of the following elements:
The KEY is an Integer corresponding to the index of the token in the acceptedTokens array.
The VALUE is the amount sent.

When someone calls the function Send Funds to Project:
If they are calling it for the first time, a new entry is created in the contributions mapping with their wallet/contract address as the key, while the nested mapping in the value position will contain these elements:
Key<Integer>: Index position of the payment token they are transferring to the Project within the acceptedTokens array.
Value<Integer>: Amount they are transferring, including the decimals.

If an entry with their address as the key already exists in the contributions array:
If they are funding the Project using a specific token for the first time, a new entry will be created in the nested mapping corresponding to the value element of the contributions array, with these elements:
Key<Integer>: Index position of the payment token they are transferring to the Project within the acceptedTokens array.
Value<Integer>: Amount they are transferring, including the decimals.
If it’s not the first time they are funding the project with the specific token they are using in the call, no new entries will be created in either the contributions or nested mapping, and instead, the value corresponding to the amount will be increased with the value they are sending.

## Programmatic Outcome: Automated Project Completion and Fund Release

A novel mechanism for project completion and fund release: Programmatic Outcome. This feature leverages automates the verification of project completion, eliminating the need for manual approvals or arbitration in specific scenarios.
Programmatic Outcome allows project stakeholders to define success criteria in terms of on-chain state changes. The project's completion is determined by verifying the state of a specified target contract. When the target contract reaches the predefined state, it automatically triggers the release of funds to the Contractor.

### Key Components

1. **Target Contract**: The smart contract whose state will be monitored for project completion.
2. **Desired State**: A specific condition or set of conditions that the target contract must meet.
3. **State Verification Mechanism**: A low-level function capable of reading and verifying the state of any smart contract on the network.

### Project Setup with Programmatic Outcome

When deploying a Project with Programmatic Outcome, the setup process differs slightly from the standard Homebase Project:

1. **Author**: Initiates the project and defines the success criteria.
2. **Contractor**: The entity responsible for achieving the desired state in the target contract.
3. **Target Contract**: The address of the contract whose state will determine project completion.
4. **Desired State**: The specific state or condition that must be met in the target contract.

Notably, there is no need to select an Arbiter in this setup, as the state verification is performed automatically by the smart contract.

### Technical Implementation

The core of Programmatic Outcome relies on a Generic State Checker function within the Project contract. This function uses low-level Ethereum operations to read the storage of the Target Contract:

1. **Storage Reading**: Utilizes `staticcall` and assembly-level `sload` to directly read the Target Contract's storage.
2. **State Verification**: Compares the read storage data against the Desired State defined at project initiation.
3. **Conditional Execution**: If the state matches, it triggers the fund release mechanism.


### Use Cases

1. **DeFi Protocol Upgrades**: Automatically reward developers when a protocol reaches specific metrics or states.
2. **Smart City Projects**: Release funds when IoT devices report certain environmental conditions.
3. **Supply Chain Milestones**: Trigger payments when products reach specific stages in a blockchain-tracked supply chain.
4. **Decentralized Oracles**: Incentivize oracle providers to maintain certain accuracy or uptime metrics.


By leveraging the deterministic nature of blockchain technology, programmatic outcomes opens up possibilities for faster business workflows, further solidifying the potential of decentralized technologies to support high-frequency collaborations.


# Chain-specific requirements

Depending on the underlying blockchain, certain protocol-specific requirements may affect the workflow of funding and operating a Project. On the Ethereum blockchain, for instance, funding a project with an ERC-20 token entails a two-step process. Initially, a token holder must approve the Project's smart contract to withdraw the specified amount of tokens on their behalf, by calling the approve function on the respective ERC-20 contract, specifying the Project’s contract address and the amount to be allowed. Subsequently, they can execute the funding function on the Project’s smart contract, which will trigger the transfer of the approved amount from their address to the Project’s contract address.
