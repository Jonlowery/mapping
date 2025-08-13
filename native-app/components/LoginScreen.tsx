// native-app/components/LoginScreen.tsx

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const API_URL = (Constants.expoConfig?.extra as any)?.API_URL as string;

type LoginScreenProps = {
  onLoginSuccess: () => void;
};

const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleLogin = async () => {
        setError('');
        if (!email || !password) {
            setError('Email and password are required.');
            return;
        }

        // --- THIS IS THE DEBUGGING LINE ---
        console.log(`Attempting to connect to: ${API_URL}/auth/login`);
        // ------------------------------------

        try {
            const response = await axios.post(`${API_URL}/auth/login`, {
                email,
                password,
            });

            if (response.data.token) {
                await AsyncStorage.setItem('token', response.data.token);
                onLoginSuccess();
            }
        } catch (err) {
            if (axios.isAxiosError(err) && err.response) {
                Alert.alert('Login Failed', err.response.data.message || 'Please check your credentials.');
            } else {
                Alert.alert('Login Error', 'An error occurred. Please check your network connection and the API URL.');
                console.log(err);
            }
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Sales Officer Login</Text>
            <TextInput
                style={styles.input}
                placeholder="Email Address"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
            />
            <TextInput
                style={styles.input}
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <TouchableOpacity style={styles.button} onPress={handleLogin}>
                <Text style={styles.buttonText}>Login</Text>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        padding: 20,
        backgroundColor: '#f0f2f5',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 24,
    },
    input: {
        backgroundColor: 'white',
        paddingHorizontal: 15,
        paddingVertical: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#ddd',
        marginBottom: 15,
        fontSize: 16,
    },
    button: {
        backgroundColor: '#007bff',
        padding: 15,
        borderRadius: 8,
        alignItems: 'center',
    },
    buttonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 16,
    },
    errorText: {
        color: 'red',
        textAlign: 'center',
        marginBottom: 10,
    },
});

export default LoginScreen;