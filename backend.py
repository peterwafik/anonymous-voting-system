from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from cryptography.hazmat.primitives.asymmetric import dh
import secrets

app = Flask(__name__)
CORS(app)

# Generate server's DH parameters and key pair
dh_parameters = dh.generate_parameters(generator=2, key_size=2048)
server_private_key = dh_parameters.generate_private_key()
server_public_key = server_private_key.public_key()

voters = {}  # Stores registered voters with passwords and shared secrets
votes = {}  # Stores votes
candidates = []  # List of candidates


@app.route('/')
def serve_frontend():
    return send_from_directory('.', 'index.html')


@app.route('/voting.html')
def serve_voting_page():
    return send_from_directory('.', 'voting.html')


@app.route('/get_dh_parameters', methods=['GET'])
def get_dh_parameters():
    """
    Endpoint to retrieve the server's DH public key and parameters.
    """
    parameters = dh_parameters.parameter_numbers()
    public_numbers = server_public_key.public_numbers()

    return jsonify({
        "p": parameters.p,
        "g": parameters.g,
        "server_public_key": public_numbers.y  # DH public key
    })


@app.route('/register_voters', methods=['POST'])
def register_voters():
    """
    Endpoint to register voters and generate passwords for them.
    """
    global voters, votes, candidates
    data = request.json
    names = data.get('names', [])
    candidates = data.get('candidates', [])

    if not names or not candidates:
        return jsonify({"error": "Missing names or candidates."}), 400

    voters.clear()
    votes.clear()

    for name in names:
        # Generate a random password for each voter
        password = secrets.token_hex(8)
        voters[name] = {"password": password, "shared_secret": None}
        votes[name] = None

        # Log password for testing purposes
        print(f"Voter: {name}")
        print(f"Password: {password}")
        print("-" * 50)

    return jsonify({"status": "Voters registered successfully.", "voters": list(voters.keys())})


@app.route('/voters', methods=['GET'])
def get_voters():
    """
    Endpoint to get the list of registered voters (names only).
    """
    return jsonify(list(voters.keys()))


@app.route('/exchange_dh_keys', methods=['POST'])
def exchange_dh_keys():
    """
    Endpoint to exchange DH keys and derive a shared secret for a voter.
    """
    data = request.json
    voter_name = data.get("voter_name")
    client_public_key = data.get("client_public_key")

    if not voter_name or not client_public_key:
        return jsonify({"error": "Missing voter name or client public key."}), 400

    voter = voters.get(voter_name)
    if not voter:
        return jsonify({"error": "Voter not registered."}), 404

    try:
        client_public_numbers = dh.DHPublicNumbers(
            y=int(client_public_key),
            parameter_numbers=dh_parameters.parameter_numbers()
        )
        client_public_key_obj = client_public_numbers.public_key()

        shared_secret = server_private_key.exchange(client_public_key_obj)
        voter["shared_secret"] = shared_secret.hex()
        return jsonify({"status": "DH key exchange successful."})
    except Exception as e:
        return jsonify({"error": f"Key exchange failed: {str(e)}"}), 400


@app.route('/cast_vote', methods=['POST'])
def cast_vote():
    """
    Endpoint to cast a vote. Validates the voter's password and records the vote.
    """
    data = request.json
    voter_name = data.get("voter_name")
    password = data.get("password")
    candidate = data.get("candidate")

    if not all([voter_name, password, candidate]):
        return jsonify({"error": "Missing required fields."}), 400

    if candidate not in candidates:
        return jsonify({"error": f"Invalid candidate: {candidate}."}), 400

    voter = voters.get(voter_name)
    if not voter or voter["password"] != password:
        return jsonify({"error": "Invalid password."}), 403

    votes[voter_name] = candidate
    return jsonify({"status": "Vote recorded successfully."})


@app.route('/results', methods=['GET'])
def get_results():
    """
    Endpoint to get the current vote tally.
    """
    tally = {candidate: 0 for candidate in candidates}
    for vote in votes.values():
        if vote:
            tally[vote] += 1
    return jsonify(tally)


if __name__ == '__main__':
    app.run(debug=True, port=8080)
