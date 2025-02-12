// Backend API Endpoints
const REGISTER_URL = "/register_voters";
const GET_DH_PARAMS_URL = "/get_dh_parameters";
const EXCHANGE_DH_KEYS_URL = "/exchange_dh_keys";
const VOTERS_URL = "/voters";
const CAST_VOTE_URL = "/cast_vote";
const RESULTS_URL = "/results";

// Global Variables
let candidatesList = []; // List of candidates
let votersList = []; // List of voter names

/**
 * Register Voters and initiate DH key exchange
 */
document.getElementById("register-voters")?.addEventListener("click", async () => {
    const numVoters = parseInt(document.getElementById("num-voters").value, 10);
    const names = document.getElementById("voter-names").value.split(",").map(name => name.trim());
    candidatesList = document.getElementById("candidates").value.split(",").map(candidate => candidate.trim());

    // Validate inputs
    if (names.length !== numVoters || names.includes("") || candidatesList.length === 0) {
        alert("Ensure the number of names matches participants and candidates are provided.");
        return;
    }

    try {
        // Register voters
        const response = await fetch(REGISTER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ names, candidates: candidatesList }),
        });

        if (!response.ok) {
            throw new Error("Failed to register voters.");
        }

        alert("Voters registered successfully! Check the backend console for passwords.");

        // Perform DH key exchange for each voter
        for (const name of names) {
            await performDHKeyExchange(name);
        }

        // Save candidates to localStorage for the voting page
        localStorage.setItem("candidatesList", JSON.stringify(candidatesList));

        window.location.href = "/voting.html"; // Navigate to voting page
    } catch (error) {
        alert(error.message);
    }
});

/**
 * Perform DH Key Exchange for a voter
 * @param {string} voterName - Name of the voter
 */
async function performDHKeyExchange(voterName) {
    try {
        const dhParamsResponse = await fetch(GET_DH_PARAMS_URL);
        const dhParams = await dhParamsResponse.json();

        // Extract DH parameters
        const p = BigInt(dhParams.p);
        const g = BigInt(dhParams.g);

        // Generate voter's DH key pair
        const voterPrivateKey = BigInt(crypto.getRandomValues(new Uint8Array(64)).join('')) % p;
        const voterPublicKey = g ** voterPrivateKey % p;

        // Send voter's public key to the server
        await fetch(EXCHANGE_DH_KEYS_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                voter_name: voterName,
                client_public_key: voterPublicKey.toString(),
            }),
        });

        console.log(`DH key exchange successful for voter: ${voterName}`);
    } catch (error) {
        console.error(`DH key exchange failed for voter: ${voterName}`, error);
    }
}

/**
 * Load Voters and Results
 * Dynamically updates the list of voters and live results
 */
async function loadVotersAndResults() {
    try {
        console.log("Fetching voters and results...");
        
        // Fetch voters
        const votersResponse = await fetch(VOTERS_URL);
        votersList = await votersResponse.json();
        console.log("Voters List:", votersList);

        // Fetch results
        const resultsResponse = await fetch(RESULTS_URL);
        const results = await resultsResponse.json();
        console.log("Results:", results);

        // Update the UI for voters
        const votersContainer = document.getElementById("voters-container");
        votersContainer.innerHTML = ""; // Clear existing content
        votersList.forEach(voter => {
            const voterRow = document.createElement("div");
            voterRow.className = "voter";
            voterRow.innerHTML = `
                <span>${voter}</span>
                <button class="vote-button" data-voter-name="${voter}">Vote</button>
            `;
            votersContainer.appendChild(voterRow);
        });

        // Attach event listeners to vote buttons
        document.querySelectorAll(".vote-button").forEach(button => {
            button.addEventListener("click", async (event) => {
                const voterName = event.target.getAttribute("data-voter-name");
                await initiateVoting(voterName);
            });
        });

        // Update the UI for results
        const resultsContainer = document.getElementById("results-container");
        resultsContainer.innerHTML = ""; // Clear existing content
        for (const [candidate, count] of Object.entries(results)) {
            const resultRow = document.createElement("div");
            resultRow.className = "result";
            resultRow.textContent = `${candidate}: ${count} votes`;
            resultsContainer.appendChild(resultRow);
        }
    } catch (error) {
        console.error("Error loading voters or results:", error);
    }
}

/**
 * Initiate Voting Process
 * @param {string} voterName - Name of the voter
 */
async function initiateVoting(voterName) {
    const password = prompt(`Enter your password to vote as ${voterName}:`);
    if (!password) {
        alert("Password is required.");
        return;
    }

    // Create a dropdown for candidate selection
    const candidateSelection = await createCandidateSelectionPopup();
    if (!candidateSelection) {
        alert("No candidate selected.");
        return;
    }

    try {
        // Cast vote
        const response = await fetch(CAST_VOTE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ voter_name: voterName, password, candidate: candidateSelection }),
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || "Failed to cast vote.");
        }

        alert("Vote recorded successfully!");
        await loadVotersAndResults(); // Refresh results
    } catch (error) {
        alert(error.message);
    }
}
/**
 * Create Candidate Selection Popup
 * Returns a Promise that resolves to the selected candidate
 */
function createCandidateSelectionPopup() {
    // Ensure candidatesList is loaded from localStorage
    if (!candidatesList || candidatesList.length === 0) {
        candidatesList = JSON.parse(localStorage.getItem("candidatesList")) || [];
    }

    return new Promise((resolve) => {
        // Create a modal-like popup
        const modal = document.createElement("div");
        modal.style.position = "fixed";
        modal.style.top = "50%";
        modal.style.left = "50%";
        modal.style.transform = "translate(-50%, -50%)";
        modal.style.backgroundColor = "#fff";
        modal.style.padding = "20px";
        modal.style.borderRadius = "8px";
        modal.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.2)";
        modal.style.zIndex = "1000";

        // Add a header
        const header = document.createElement("h3");
        header.textContent = "Select a Candidate";
        header.style.marginBottom = "10px";
        modal.appendChild(header);

        // Create a dropdown
        const select = document.createElement("select");
        if (candidatesList.length === 0) {
            const noCandidatesOption = document.createElement("option");
            noCandidatesOption.value = "";
            noCandidatesOption.textContent = "No candidates available";
            select.appendChild(noCandidatesOption);
        } else {
            candidatesList.forEach(candidate => {
                const option = document.createElement("option");
                option.value = candidate;
                option.textContent = candidate;
                select.appendChild(option);
            });
        }
        select.style.width = "100%";
        select.style.marginBottom = "10px";
        select.style.padding = "8px";
        modal.appendChild(select);

        // Add Confirm button
        const confirmButton = document.createElement("button");
        confirmButton.textContent = "Confirm";
        confirmButton.style.padding = "8px 16px";
        confirmButton.style.backgroundColor = "#007bff";
        confirmButton.style.color = "#fff";
        confirmButton.style.border = "none";
        confirmButton.style.borderRadius = "4px";
        confirmButton.style.cursor = "pointer";
        confirmButton.addEventListener("click", () => {
            const selectedCandidate = select.value;
            document.body.removeChild(modal); // Remove modal from DOM
            resolve(selectedCandidate || null); // Resolve with selected candidate or null
        });
        modal.appendChild(confirmButton);

        // Add Cancel button
        const cancelButton = document.createElement("button");
        cancelButton.textContent = "Cancel";
        cancelButton.style.marginLeft = "10px";
        cancelButton.style.padding = "8px 16px";
        cancelButton.style.backgroundColor = "#dc3545";
        cancelButton.style.color = "#fff";
        cancelButton.style.border = "none";
        cancelButton.style.borderRadius = "4px";
        cancelButton.style.cursor = "pointer";
        cancelButton.addEventListener("click", () => {
            document.body.removeChild(modal); // Remove modal from DOM
            resolve(null); // Resolve with null (no selection)
        });
        modal.appendChild(cancelButton);

        // Append modal to body
        document.body.appendChild(modal);
    });
}


/**
 * Initialize Voting Page
 * Loads voters and results dynamically on page load
 */
if (document.getElementById("voters-container")) {
    loadVotersAndResults();
}
