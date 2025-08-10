// frontend/src/components/MapDashboard.js

import React, { useEffect, useState } from 'react';
import axios from 'axios';
// Import components from the react-leaflet library
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
// Import the default Leaflet CSS
import 'leaflet/dist/leaflet.css';
// Import a library to fix an issue with default marker icons in React
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

// FIX: Manually set the default marker icon paths for Leaflet
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;


const MapDashboard = ({ onLogout }) => {
    // State to hold the user's assigned banks, fetched from the API.
    const [banks, setBanks] = useState([]);
    const [error, setError] = useState('');
    // State to hold the map's center coordinates. Default to the center of the US.
    const [mapCenter, setMapCenter] = useState([39.8283, -98.5795]);

    // This useEffect hook runs once when the component is first mounted.
    // Its job is to fetch the bank data from our backend.
    useEffect(() => {
        const fetchBanks = async () => {
            try {
                const token = localStorage.getItem('token');
                if (!token) {
                    setError('Authentication token not found. Please log in again.');
                    return;
                }

                const response = await axios.get('http://127.0.0.1:5000/banks', {
                    headers: { 'x-access-token': token }
                });
                
                setBanks(response.data);

                // If banks are found, set the map center to the first bank's location
                if (response.data.length > 0) {
                    const firstBank = response.data[0];
                    if (firstBank.latitude && firstBank.longitude) {
                        setMapCenter([firstBank.latitude, firstBank.longitude]);
                    }
                }

            } catch (err) {
                console.error("Error fetching banks:", err);
                setError('Failed to fetch bank data.');
            }
        };

        fetchBanks();
    }, []); // The empty dependency array [] ensures this effect runs only once.

    return (
        <div style={styles.pageContainer}>
             <div style={styles.sidebar}>
                <h2>Your Banks</h2>
                <p>Showing {banks.length} locations.</p>
                <button onClick={onLogout} style={styles.logoutButton}>Logout</button>
                {error && <p style={{ color: 'red' }}>{error}</p>}
            </div>
            {/* The MapContainer component is the root of the map. */}
            <MapContainer center={mapCenter} zoom={10} style={styles.mapContainer}>
                {/* The TileLayer component provides the map imagery from OpenStreetMap. */}
                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                
                {/* We map over the banks array to create a Marker for each one. */}
                {banks.map(bank => (
                    // Ensure the bank has valid latitude and longitude before creating a marker.
                    bank.latitude && bank.longitude && (
                        <Marker key={bank.id} position={[bank.latitude, bank.longitude]}>
                            {/* The Popup component creates a popup that appears when a marker is clicked. */}
                            <Popup>
                                <b>{bank.name}</b><br />
                                {bank.address_line_1}
                            </Popup>
                        </Marker>
                    )
                ))}
            </MapContainer>
        </div>
    );
};

const styles = {
    pageContainer: {
        display: 'flex',
        height: '100vh',
        width: '100vw',
    },
    sidebar: {
        width: '300px',
        padding: '20px',
        backgroundColor: '#f8f9fa',
        boxShadow: '2px 0 5px rgba(0,0,0,0.1)',
        zIndex: 1000,
        overflowY: 'auto'
    },
    mapContainer: {
        flex: 1, // The map takes up the rest of the available space
        height: '100%',
    },
    logoutButton: {
        marginTop: '10px',
        padding: '8px 12px',
        backgroundColor: '#dc3545',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
    }
};

export default MapDashboard;
