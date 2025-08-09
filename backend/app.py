# backend/app.py

import os
import datetime
from functools import wraps

from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.security import check_password_hash
import psycopg2
from psycopg2.extras import RealDictCursor
import jwt
import requests
from dotenv import load_dotenv

# ---------------- Load environment variables ----------------
load_dotenv()

# ---------------- Flask App Initialization ----------------
app = Flask(__name__)
app.config["SECRET_KEY"] = os.getenv("JWT_SECRET", "change_me_please")

CORS(app)

# ---------------- Database Connection Details ----------------
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    # Fallback for local development if DATABASE_URL isn't set
    DB_NAME = os.getenv("DB_NAME", "mapping_app_db")
    DB_USER = os.getenv("DB_USER", "postgres")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "")
    DB_HOST = os.getenv("DB_HOST", "localhost")
    DB_PORT = os.getenv("DB_PORT", "5432")

# ---------------- OpenRouteService API Key ----------------
ORS_API_KEY = os.getenv("ORS_API_KEY", "")

# ---------------- Database Helper ----------------
def get_db_connection():
    """Establish a new DB connection."""
    if DATABASE_URL:
        return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    else:
        return psycopg2.connect(
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
            host=DB_HOST,
            port=DB_PORT,
            cursor_factory=RealDictCursor
        )

# ---------------- Auth Decorator ----------------
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get("x-access-token", None)
        if not token:
            return jsonify({"message": "Token is missing!"}), 401
        try:
            data = jwt.decode(token, app.config["SECRET_KEY"], algorithms=["HS256"])
            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM Users WHERE id = %s;", (data["user_id"],))
                current_user = cur.fetchone()
            conn.close()
            if not current_user:
                return jsonify({"message": "Token is valid, but user not found."}), 401
        except Exception as e:
            return jsonify({"message": "Token is invalid!", "error": str(e)}), 401
        return f(current_user, *args, **kwargs)
    return decorated

# ---------------- Routes ----------------

@app.route("/")
def index():
    return jsonify({"status": "Backend server is running!"})

@app.route("/auth/login", methods=["POST"])
def login():
    auth_data = request.get_json()
    if not auth_data or not auth_data.get("email") or not auth_data.get("password"):
        return jsonify({"message": "Email and password are required"}), 400

    email = auth_data["email"]
    password = auth_data["password"]

    conn = get_db_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM Users WHERE email = %s;", (email,))
        user = cur.fetchone()
    conn.close()

    if not user:
        return jsonify({"message": "User not found"}), 401

    if check_password_hash(user["password_hash"], password):
        token = jwt.encode({
            "user_id": user["id"],
            "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=24)
        }, app.config["SECRET_KEY"], algorithm="HS256")
        return jsonify({"token": token})

    return jsonify({"message": "Invalid credentials"}), 401

@app.route("/banks", methods=["GET"])
@token_required
def get_banks(current_user):
    user_id = current_user["id"]
    conn = get_db_connection()
    with conn.cursor() as cur:
        cur.execute("""
            SELECT b.id, b.name, b.address_line_1, b.city, b.state, b.zip_code, b.latitude, b.longitude 
            FROM Banks b
            JOIN Assignments a ON b.id = a.bank_id
            WHERE a.user_id = %s;
        """, (user_id,))
        banks = cur.fetchall()
    conn.close()
    return jsonify(banks)

@app.route("/optimize-route", methods=["GET"])
@token_required
def optimize_route(current_user):
    stop_ids_str = request.args.get("stops")
    if not stop_ids_str:
        return jsonify({"message": "Missing 'stops' parameter"}), 400

    stop_ids = [int(x) for x in stop_ids_str.split(",") if x.strip().isdigit()]
    if len(stop_ids) < 2:
        return jsonify({"message": "At least two stops are required"}), 400

    # Fetch bank details for given IDs
    conn = get_db_connection()
    banks_by_id = {}
    placeholders = ",".join(["%s"] * len(stop_ids))
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT id, name, address_line_1, latitude, longitude FROM Banks WHERE id IN ({placeholders});",
            stop_ids
        )
        for bank in cur.fetchall():
            banks_by_id[bank["id"]] = bank
    conn.close()

    if len(banks_by_id) != len(stop_ids):
        return jsonify({"message": "One or more stop IDs not found"}), 400

    locations = [[banks_by_id[stop_id]["longitude"], banks_by_id[stop_id]["latitude"]] for stop_id in stop_ids]

    # Build ORS optimization request
    jobs = [{"id": idx, "location": locations[i]} for idx, i in enumerate(range(1, len(locations)), start=1)]
    vehicles = [{
        "id": 1,
        "profile": "driving-car",
        "start": locations[0],
        "end": locations[0]
    }]

    headers = {
        "Authorization": ORS_API_KEY,
        "Content-Type": "application/json"
    }
    opt_body = {"jobs": jobs, "vehicles": vehicles}

    try:
        opt_res = requests.post("https://api.openrouteservice.org/optimization", json=opt_body, headers=headers)
        opt_res.raise_for_status()
        opt_data = opt_res.json()

        optimized_job_indices = [step["job"] for step in opt_data["routes"][0]["steps"] if "job" in step]
        optimized_stop_ids = [stop_ids[0]] + [stop_ids[j] for j in optimized_job_indices]

        # Get full route geometry
        optimized_coords = [[banks_by_id[stop_id]["longitude"], banks_by_id[stop_id]["latitude"]] for stop_id in optimized_stop_ids]
        dir_body = {"coordinates": optimized_coords}
        dir_res = requests.post(
            "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
            json=dir_body,
            headers=headers
        )
        dir_res.raise_for_status()
        dir_data = dir_res.json()

        route_geometry = dir_data["features"][0]["geometry"]["coordinates"]
        optimized_stops_data = [banks_by_id[stop_id] for stop_id in optimized_stop_ids]

        return jsonify({
            "optimized_stops": optimized_stops_data,
            "route_geometry": route_geometry
        })

    except requests.exceptions.RequestException as e:
        return jsonify({"message": "Failed to contact ORS", "error": str(e)}), 500
    except (KeyError, IndexError) as e:
        return jsonify({"message": "Error parsing ORS response", "error": str(e)}), 500

# ---------------- Main ----------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True)
