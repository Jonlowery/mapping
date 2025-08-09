# backend/scripts/import_data.py

import os
import pandas as pd
import psycopg2 # For connecting to PostgreSQL
from psycopg2.extras import execute_batch
from geopy.geocoders import ArcGIS # Switched to a more reliable geocoder
from werkzeug.security import generate_password_hash # For creating secure passwords
import time
import re

# --- Configuration ---
# Database connection details (replace with your actual credentials)
DB_NAME = "mapping_app_db"
DB_USER = "postgres"
DB_PASSWORD = "JLPWJonjon01!!!"
DB_HOST = "localhost"
DB_PORT = "5432"

# Path to the data files
# This assumes the script is run from the root `MappingApp/` directory.
SALESPEOPLE_CSV = os.path.join('data', 'Salespeople.csv')
BANKS_CSV = os.path.join('data', 'Banks.csv')

# Geocoding setup
geolocator = ArcGIS(user_agent="mapping_app_v1")

def get_lat_lon(address):
    """
    Geocodes a full address string to get latitude and longitude.
    Includes a delay to respect API rate limits.
    """
    try:
        # A short delay can help with services that have rate limits.
        time.sleep(1) 
        location = geolocator.geocode(address, timeout=10)
        if location:
            return location.latitude, location.longitude
    except Exception as e:
        print(f"  - CRITICAL GEOCoding ERROR for address '{address}': {e}")
    return None, None

def import_salespeople(conn):
    """
    Reads salespeople.csv and populates the Users table.
    """
    print("Step 1: Importing Salespeople into Users table...")
    df = pd.read_csv(SALESPEOPLE_CSV)
    
    users_to_insert = []
    for index, row in df.iterrows():
        name = row['TIB Investments Officer']
        email = row['Email Address']
        
        # In a real app, you might send this password to the user or have them reset it.
        # For now, we'll use a simple default password.
        password = "defaultpassword123" 
        password_hash = generate_password_hash(password)
        
        users_to_insert.append((name, email, password_hash))

    with conn.cursor() as cur:
        # Use ON CONFLICT to prevent errors if you run the script multiple times.
        execute_batch(cur, 
            "INSERT INTO Users (name, email, password_hash) VALUES (%s, %s, %s) ON CONFLICT (email) DO NOTHING;", 
            users_to_insert)
    conn.commit()
    print(f"-> Successfully processed {len(users_to_insert)} salespeople.\n")

def import_banks_and_assignments(conn):
    """
    Reads Banks.csv, geocodes addresses, populates the Banks table,
    and creates the links in the Assignments table.
    """
    print("Step 2: Importing Banks and creating assignments...")
    df_banks = pd.read_csv(BANKS_CSV)

    # First, get a map of officer names to their IDs from the database
    with conn.cursor() as cur:
        cur.execute("SELECT id, name FROM Users;")
        user_map = {name: user_id for user_id, name in cur.fetchall()}

    assignments_to_create = []
    banks_imported_count = 0

    for index, row in df_banks.iterrows():
        # --- Prepare Bank Data ---
        bank_name = row['Relationship Name']
        
        # IMPROVED: Robustly build the address string, ignoring empty/NaN parts.
        address_parts = [
            str(row['Physical Address Line 1']),
            str(row['Physical City']),
            str(row['Physical State/Province']),
            str(row['Physical Zip/Postal Code'])
        ]
        full_address = ", ".join(part for part in address_parts if part and pd.notna(part) and part.lower() != 'nan')
        
        print(f"  - Processing Bank: {bank_name}")
        lat, lon = get_lat_lon(full_address)

        if lat is None or lon is None:
            # IMPROVED: More descriptive warning message for easier debugging.
            print(f"  - WARNING: Could not find coordinates for '{bank_name}' using address '{full_address}'. Skipping.")
            continue

        bank_data = (
            bank_name, 
            row['Physical Address Line 1'], 
            row['Physical City'], 
            row['Physical State/Province'], 
            row['Physical Zip/Postal Code'], 
            lat, 
            lon
        )
        
        # --- Insert Bank and get its new ID ---
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO Banks (name, address_line_1, city, state, zip_code, latitude, longitude)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                RETURNING id;
                """,
                bank_data
            )
            result = cur.fetchone()
            if result is None: # Bank might already exist if you run the script again
                cur.execute("SELECT id FROM Banks WHERE name = %s;", (bank_name,))
                result = cur.fetchone()

            bank_id = result[0]
            banks_imported_count += 1

            # --- Handle Assignments ---
            officer_names_raw = str(row['TIB Investments Officer'])
            # Use regex to split names by '&' or ','
            officer_names = re.split(r'\s*&\s*|\s*,\s*', officer_names_raw)
            
            for officer_name in officer_names:
                officer_name = officer_name.strip()
                if officer_name in user_map:
                    user_id = user_map[officer_name]
                    assignments_to_create.append((user_id, bank_id))
                    print(f"    - Assigning to {officer_name}")
                else:
                    print(f"    - WARNING: Officer '{officer_name}' not found in Users table. Cannot create assignment.")
    
    # --- Bulk insert assignments ---
    if assignments_to_create:
        with conn.cursor() as cur:
            execute_batch(cur, 
                "INSERT INTO Assignments (user_id, bank_id) VALUES (%s, %s) ON CONFLICT (user_id, bank_id) DO NOTHING;", 
                assignments_to_create)
    
    conn.commit()
    print(f"\n-> Successfully imported {banks_imported_count} banks and created/updated {len(assignments_to_create)} assignments.")


def main():
    """
    Main function to connect to the database and run the import process.
    """
    conn = None
    try:
        conn = psycopg2.connect(
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
            host=DB_HOST,
            port=DB_PORT
        )
        print("Successfully connected to the database.")
        
        import_salespeople(conn)
        import_banks_and_assignments(conn)
        
        print("\nData import process completed successfully!")

    except psycopg2.Error as e:
        print(f"Database error: {e}")
    finally:
        if conn:
            conn.close()
            print("Database connection closed.")

if __name__ == "__main__":
    main()
