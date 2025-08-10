// frontend/src/App.js

import React, { useState, useEffect } from 'react';
import Login from './components/Login'; // Import the Login component we just created
import MapDashboard from './components/MapDashboard';

function App() {
  // We use state to track whether the user is authenticated.
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // 'useEffect' is a hook that runs after the component renders.
  // We use it here to check if a token already exists in localStorage
  // when the app first loads. This keeps the user logged in if they
  // refresh the page.
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      setIsAuthenticated(true);
    }
  }, []); // The empty array [] means this effect runs only once, on component mount.

  // This function is passed down to the Login component.
  // It will be called upon a successful login to update the state.
  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  // This function will handle logging the user out.
  const handleLogout = () => {
    localStorage.removeItem('token'); // Remove the token from storage
    setIsAuthenticated(false); // Update the state
  };

  return (
    <div className="App">
      {/* This is conditional rendering.
          If the user is authenticated, we show the MapDashboard.
          Otherwise, we show the Login component. */}
      {isAuthenticated ? (
        <MapDashboard onLogout={handleLogout} />
      ) : (
        <Login onLoginSuccess={handleLoginSuccess} />
      )}
    </div>
  );
}

export default App;
