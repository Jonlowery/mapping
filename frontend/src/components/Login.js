// frontend/src/components/Login.js

import React, { useState } from 'react'; // CORRECTED THIS LINE
import axios from 'axios';

// The Login component receives a function `onLoginSuccess` as a prop.
// We will call this function after a successful login to notify the main App component.
const Login = ({ onLoginSuccess }) => {
    // 'useState' is a React Hook to manage state in a functional component.
    // We create state variables for the email, password, and any error messages.
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    // This function is called when the login form is submitted.
    const handleLogin = async (e) => {
        // e.preventDefault() stops the browser from reloading the page, which is the default form submission behavior.
        e.preventDefault();
        setError(''); // Clear any previous errors.

        try {
            // We use axios to send a POST request to our backend's /auth/login endpoint.
            // The backend expects a JSON object with 'email' and 'password'.
            const response = await axios.post('http://127.0.0.1:5000/auth/login', {
                email: email,
                password: password,
            });

            // If the login is successful, the backend sends back a token.
            if (response.data.token) {
                // We store the token in the browser's localStorage. This lets us
                // stay logged in even if we refresh the page.
                localStorage.setItem('token', response.data.token);
                
                // We call the onLoginSuccess function passed down from the App component.
                // This will trigger the app to switch from the login view to the map view.
                onLoginSuccess();
            }
        } catch (err) {
            // If the backend returns an error (e.g., 401 for wrong password),
            // we catch it here and display an error message to the user.
            if (err.response && err.response.data) {
                setError(err.response.data.message || 'Login failed. Please try again.');
            } else {
                setError('Login failed. Please check your connection and try again.');
            }
        }
    };

    // This is the JSX that defines the component's HTML structure.
    return (
        <div style={styles.container}>
            <div style={styles.loginBox}>
                <h2 style={styles.title}>Sales Officer Login</h2>
                <form onSubmit={handleLogin}>
                    <div style={styles.inputGroup}>
                        <label htmlFor="email" style={styles.label}>Email Address</label>
                        <input
                            type="email"
                            id="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            style={styles.input}
                        />
                    </div>
                    <div style={styles.inputGroup}>
                        <label htmlFor="password" style={styles.label}>Password</label>
                        <input
                            type="password"
                            id="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            style={styles.input}
                        />
                    </div>
                    {/* If there's an error, we display it here. */}
                    {error && <p style={styles.error}>{error}</p>}
                    <button type="submit" style={styles.button}>Login</button>
                </form>
            </div>
        </div>
    );
};

// Basic inline styling for the component. In a larger app, this would be in a separate CSS file.
const styles = {
    container: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#f0f2f5',
    },
    loginBox: {
        padding: '40px',
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
        width: '100%',
        maxWidth: '400px',
    },
    title: {
        marginBottom: '24px',
        color: '#333',
        textAlign: 'center',
    },
    inputGroup: {
        marginBottom: '20px',
    },
    label: {
        display: 'block',
        marginBottom: '8px',
        color: '#555',
        fontWeight: 'bold',
    },
    input: {
        width: '100%',
        padding: '10px',
        border: '1px solid #ddd',
        borderRadius: '4px',
        boxSizing: 'border-box', // Ensures padding doesn't affect final width
    },
    button: {
        width: '100%',
        padding: '12px',
        backgroundColor: '#007bff',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '16px',
        fontWeight: 'bold',
    },
    error: {
        color: 'red',
        textAlign: 'center',
        marginBottom: '10px',
    }
};

export default Login;
