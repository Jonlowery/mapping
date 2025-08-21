// native-app/components/MapScreen.tsx

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, Button, Linking, Platform, Alert,
  ScrollView, TouchableOpacity, TextInput, FlatList, Keyboard, SafeAreaView, KeyboardAvoidingView
} from 'react-native';
import ClusteredMapView from 'react-native-map-clustering';
import MapView, { Marker, Polyline } from 'react-native-maps';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import Constants from 'expo-constants';

const API_URL = (Constants.expoConfig?.extra as any)?.API_URL as string;

const MAX_STOPS = 14;
const RADIUS_OPTIONS = [5, 10, 25, 50, 100] as const;
type RadiusOption = typeof RADIUS_OPTIONS[number];

type Bank = {
  id: number | string;
  name: string;
  latitude: number;
  longitude: number;
  address_line_1: string;
  city?: string;
  state?: string;
};

type RouteCoordinate = { latitude: number; longitude: number; };

type MapScreenProps = { onLogout: () => void; };

// Robust coordinate validation
const isValidCoord = (x: unknown, min: number, max: number) =>
  typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;

const MapScreen: React.FC<MapScreenProps> = ({ onLogout }) => {
  const mapRef = useRef<MapView | null>(null);

  const [banks, setBanks] = useState<Bank[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [routeStops, setRouteStops] = useState<Bank[]>([]);
  const [selectedBank, setSelectedBank] = useState<Bank | null>(null);

  const [route, setRoute] = useState<RouteCoordinate[]>([]);
  const [isRouteLoading, setIsRouteLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Bank[]>([]);

  const [radius, setRadius] = useState<RadiusOption>(100);

  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locError, setLocError] = useState<string | null>(null);

  const shouldAutoFitRef = useRef(false);

  // Fetch banks
  useEffect(() => {
    const init = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        if (!token) throw new Error('Authentication token not found.');
        const response = await axios.get(`${API_URL}/banks`, { headers: { 'x-access-token': token } });

        const allBanks: Bank[] = response.data;
        const validBanks = allBanks.filter((bank: Bank) => {
          const ok = isValidCoord(bank.latitude, -90, 90) && isValidCoord(bank.longitude, -180, 180);
          if (!ok) console.log('Filtered out invalid bank record:', bank);
          return ok;
        });
        setBanks(validBanks);
      } catch (e) {
        console.error('Bank fetch failed', e);
        setError('Failed to fetch bank data.');
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  // Get current location on mount
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') { setLocError('Location permission denied.'); return; }
        const pos = await Location.getCurrentPositionAsync({});
        const center = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setUserLocation(center);
        setTimeout(() => {
          if (!mapRef.current) return;
          mapRef.current.animateCamera({ center, zoom: 11 }, { duration: 800 });
        }, 300);
      } catch {
        setLocError('Could not determine current location.');
      }
    })();
  }, []);

  const centerOn = (lat: number, lon: number, zoom: number = 11) =>
    mapRef.current?.animateCamera({ center: { latitude: lat, longitude: lon }, zoom }, { duration: 600 });

  // ----- Route selection -----
  const addBankToRoute = (bank: Bank) => {
    const bankId = Number(bank.id);
    setRouteStops(prev => {
      if (prev.some(s => Number(s.id) === bankId)) {
        Alert.alert("Already Added", "This bank is already in your route.");
        return prev;
      }
      if (prev.length >= MAX_STOPS) {
        Alert.alert("Route Limit Reached", `You can only have up to ${MAX_STOPS} stops at once.`);
        return prev;
      }
      return [...prev, bank];
    });
    setSelectedBank(null);
    centerOn(bank.latitude, bank.longitude, 12);
  };

  const removeBankFromRoute = (bankId: number) => {
    setRouteStops(current => current.filter(stop => Number(stop.id) !== Number(bankId)));
  };

  const clearRoute = () => {
    setRouteStops([]);
    setRoute([]);
    setSelectedBank(null);
    setSearchQuery('');
    setSearchResults([]);
  };

  // ----- Auto optimize whenever routeStops changes -----
  useEffect(() => {
    let cancelled = false;
    shouldAutoFitRef.current = true;

    const autoOptimize = async () => {
      if (routeStops.length < 2) { setRoute([]); return; }
      try {
        setIsRouteLoading(true);
        const token = await AsyncStorage.getItem('token');
        const stopIds = routeStops.map(stop => Number(stop.id)).join(',');
        const response = await axios.get(`${API_URL}/optimize-route?stops=${stopIds}`, {
          headers: { 'x-access-token': token || '' },
        });
        if (cancelled) return;

        const { optimized_stops, route_geometry } = response.data;
        const formattedRoute: RouteCoordinate[] = route_geometry.map((p: number[]) => ({ longitude: p[0], latitude: p[1] }));

        // guard against infinite loop if server returns slightly different order repeatedly
        const sameOrder =
          routeStops.length === optimized_stops.length &&
          routeStops.every((s, i) => Number(s.id) === Number(optimized_stops[i].id));

        if (!sameOrder) setRouteStops(optimized_stops);
        setRoute(formattedRoute);

        const first = optimized_stops[0];
        if (first) centerOn(first.latitude, first.longitude, 10);

        if (shouldAutoFitRef.current) {
          setTimeout(() => {
            fitToRoute();
            shouldAutoFitRef.current = false;
          }, 150);
        }
      } catch (e) {
        if (!cancelled) Alert.alert("Routing Error", "Could not calculate the optimized route.");
        setRoute([]);
      } finally {
        if (!cancelled) setIsRouteLoading(false);
      }
    };

    const t = setTimeout(autoOptimize, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [routeStops]);

  // ----- External navigation -----
  const handleLaunchNavigation = () => {
    if (routeStops.length < 1) return;
    const hasUserLoc = !!userLocation;
    let stops = routeStops;

    if (stops.length > MAX_STOPS) {
      stops = stops.slice(0, MAX_STOPS);
      Alert.alert("Too Many Stops", `Apple Maps may not support that many waypoints. Using the first ${MAX_STOPS} stops.`);
    }

    if (Platform.OS === 'ios') {
      const saddr = hasUserLoc ? `${userLocation!.latitude},${userLocation!.longitude}` : `${stops[0].latitude},${stops[0].longitude}`;
      let daddr = `${stops[0].latitude},${stops[0].longitude}`;
      if (stops.length > 1) {
        for (let i = 1; i < stops.length; i++) {
          daddr += `+to:${stops[i].latitude},${stops[i].longitude}`;
        }
      }
      const url = `http://maps.apple.com/?saddr=${encodeURIComponent(saddr)}&daddr=${encodeURIComponent(daddr)}`;
      Linking.openURL(url).catch(() => Alert.alert("Could not open Apple Maps", "An error occurred."));
    } else {
      const origin = hasUserLoc ? `${userLocation!.latitude},${userLocation!.longitude}` : `${stops[0].latitude},${stops[0].longitude}`;
      const destination = `${stops[stops.length - 1].latitude},${stops[stops.length - 1].longitude}`;
      const waypointsList = stops.slice(0, stops.length - 1).map(s => `${s.latitude},${s.longitude}`);
      const waypoints = waypointsList.length ? `&waypoints=${encodeURIComponent(waypointsList.join('|'))}` : '';
      const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}${waypoints}`;
      Linking.openURL(url).catch(() => Alert.alert("Could not open Google Maps", "An error occurred."));
    }
  };

  // ----- Nearby & search -----
  const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 3958.8; const toRad = (x: number) => x * Math.PI / 180;
    const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
    return 2 * R * Math.asin(Math.sqrt(a));
  };

  const addNearbyBanks = (bank: Bank, radiusMiles: number) => {
    const nearby = banks.filter(b => haversineDistance(bank.latitude, bank.longitude, b.latitude, b.longitude) <= radiusMiles);
    setRouteStops(prev => {
      const existing = new Set(prev.map(p => Number(p.id)));
      const available = Math.max(0, MAX_STOPS - prev.length);
      const additions = nearby.filter(nb => !existing.has(Number(nb.id))).slice(0, available);
      const skipped = nearby.filter(nb => !existing.has(Number(nb.id))).length - additions.length;
      const next = [...prev, ...additions];
      Alert.alert("Nearby Banks", `${additions.length} added within ${radiusMiles} miles of ${bank.name}.${skipped > 0 ? ` ${skipped} skipped (route limit ${MAX_STOPS}).` : ''}`);
      return next;
    });
    centerOn(bank.latitude, bank.longitude, 9);
  };

  const onSearchChange = (text: string) => {
    setSearchQuery(text);
    if (text.trim() === '') { setSearchResults([]); return; }
    const lower = text.toLowerCase();
    const filtered = banks.filter(b =>
      (b.name && b.name.toLowerCase().includes(lower)) ||
      (b.city && b.city.toLowerCase().includes(lower)) ||
      (b.state && b.state.toLowerCase().includes(lower))
    );
    setSearchResults(filtered);
  };

  const addFromSearch = (bank: Bank) => { addBankToRoute(bank); Keyboard.dismiss(); };
  const addNearbyFromSearch = (bank: Bank) => { addNearbyBanks(bank, radius); Keyboard.dismiss(); };

  // ----- Fit to route (chip + helper) -----
  const fitToRoute = () => {
    const coords: { latitude: number; longitude: number }[] = [];
    if (route.length > 0) coords.push(...route);
    else routeStops.forEach(s => coords.push({ latitude: s.latitude, longitude: s.longitude }));
    if (userLocation) coords.push(userLocation);
    if (coords.length === 0) return;
    mapRef.current?.fitToCoordinates(coords, {
      edgePadding: { top: 80, right: 40, bottom: 240, left: 40 },
      animated: true,
    });
  };

  if (isLoading) {
    return (<View style={styles.centered}><ActivityIndicator size="large" /><Text>Loading Map...</Text></View>);
  }
  if (error) {
    return (<View style={styles.centered}><Text style={styles.errorText}>{error}</Text><Button title="Logout" onPress={onLogout} /></View>);
  }

  const initialRegion = userLocation
    ? { latitude: userLocation.latitude, longitude: userLocation.longitude, latitudeDelta: 0.0922, longitudeDelta: 0.0421 }
    : (banks.length > 0
        ? { latitude: banks[0].latitude, longitude: banks[0].longitude, latitudeDelta: 0.0922, longitudeDelta: 0.0421 }
        : { latitude: 39.5, longitude: -98.35, latitudeDelta: 20, longitudeDelta: 20 });

  return (
    <View style={styles.container}>
      <ClusteredMapView
        ref={(ref) => { mapRef.current = ref as unknown as MapView; }}
        style={styles.map}
        initialRegion={initialRegion}
        onPress={() => setSelectedBank(null)}
        showsUserLocation
        clusterColor="#1E90FF"
      >
        {banks.map((bank) => {
          const inRoute = routeStops.some(stop => Number(stop.id) === Number(bank.id));
          const isStart = routeStops.length > 0 && Number(routeStops[0].id) === Number(bank.id);
          const description = [bank.address_line_1, bank.city, bank.state].filter(Boolean).join(', ');
          return (
            <Marker
              key={String(bank.id)}
              coordinate={{ latitude: bank.latitude, longitude: bank.longitude }}
              pinColor={isStart ? '#1E90FF' : inRoute ? 'green' : undefined}
              title={bank.name}
              description={description}
              onPress={(e) => { (e as any)?.stopPropagation?.(); setSelectedBank(bank); }}
              tracksViewChanges={false}
            />
          );
        })}

        {route.length > 0 && (
          <Polyline coordinates={route} strokeColor="#007bff" strokeWidth={5} />
        )}
      </ClusteredMapView>

      <SafeAreaView pointerEvents="box-none" style={styles.overlayRoot}>
        <View style={styles.logoutButtonContainer}>
          <Button title="Logout" onPress={onLogout} color="#dc3545" />
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
        style={styles.kbWrapper}
      >
        {selectedBank ? (
          <View style={styles.selectionPanel} pointerEvents="auto">
            <Text style={styles.panelTitle}>{selectedBank.name}</Text>
            <Text style={styles.panelAddress}>{selectedBank.address_line_1}</Text>
            <Text style={styles.sectionLabel}>Nearby radius</Text>
            <View style={styles.radiusRow}>
              {RADIUS_OPTIONS.map(opt => (
                <TouchableOpacity key={opt} style={[styles.radiusChip, radius === opt && styles.radiusChipActive]} onPress={() => setRadius(opt)}>
                  <Text style={[styles.radiusChipText, radius === opt && styles.radiusChipTextActive]}>{opt} mi</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ height: 8 }} />
            <Button title="Add to Route" onPress={() => addBankToRoute(selectedBank)} />
            <View style={{ height: 6 }} />
            <Button title={`Add Nearby (${radius} mi)`} onPress={() => addNearbyBanks(selectedBank, radius)} />
          </View>
        ) : (
          <View style={styles.routingPanel} pointerEvents="auto">
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={styles.panelTitle}>Build Your Route</Text>
              {isRouteLoading ? <ActivityIndicator /> : null}
            </View>
            <View style={styles.searchRow}>
              <TextInput
                placeholder="Search by name, city, or state"
                value={searchQuery}
                onChangeText={onSearchChange}
                style={styles.searchInput}
                returnKeyType="search"
              />
            </View>
            {searchQuery.length > 0 && (
              <FlatList
                style={styles.searchResultsInPanel}
                data={searchResults}
                keyboardShouldPersistTaps="handled"
                keyExtractor={item => String(item.id)}
                renderItem={({ item }) => (
                  <View style={styles.searchResultItem}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text numberOfLines={1}>
                        {item.name} {item.city || item.state ? `(${item.city ?? ''}${item.city && item.state ? ', ' : ''}${item.state ?? ''})` : ''}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row' }}>
                      <Button title="Add" onPress={() => addFromSearch(item)} />
                      <View style={{ width: 6 }} />
                      <Button title={`Nearby (${radius} mi)`} onPress={() => addNearbyFromSearch(item)} />
                    </View>
                  </View>
                )}
                ListEmptyComponent={<Text style={styles.emptyResults}>No matches</Text>}
              />
            )}
            <Text style={styles.sectionLabel}>Nearby radius</Text>
            <View style={styles.radiusRow}>
              {RADIUS_OPTIONS.map(opt => (
                <TouchableOpacity key={opt} style={[styles.radiusChip, radius === opt && styles.radiusChipActive]} onPress={() => setRadius(opt)}>
                  <Text style={[styles.radiusChipText, radius === opt && styles.radiusChipTextActive]}>{opt} mi</Text>
                </TouchableOpacity>
              ))}
            </View>
            {routeStops.length > 0 && (
              <>
                <Text style={[styles.panelTitle, { marginTop: 8 }]}>Current Route ({routeStops.length}/{MAX_STOPS})</Text>
                <ScrollView style={{ maxHeight: 120 }}>
                  {routeStops.map((stop, index) => (
                    <View key={String(stop.id)} style={styles.stopRow}>
                      <Text>{index + 1}. {stop.name}</Text>
                      <TouchableOpacity onPress={() => removeBankFromRoute(Number(stop.id))}>
                        <Text style={styles.removeText}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              </>
            )}
            <View style={styles.fitRow}>
              <TouchableOpacity onPress={fitToRoute} style={styles.fitChip} disabled={routeStops.length === 0 && route.length === 0}>
                <Text style={styles.fitChipText}>Fit to Route</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.buttonRow}>
              <Button title="Launch Nav" onPress={handleLaunchNavigation} disabled={routeStops.length === 0} />
              <Button title="Clear" onPress={clearRoute} color="grey" />
            </View>
            {locError && <Text style={styles.locNote}>{locError}</Text>}
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFillObject, backgroundColor: '#fff' },
  map: { ...StyleSheet.absoluteFillObject, zIndex: 0 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: 'red', marginBottom: 10 },
  overlayRoot: { ...StyleSheet.absoluteFillObject, zIndex: 10 },
  logoutButtonContainer: {
    position: 'absolute', top: 10, right: 10,
    backgroundColor: 'white', borderRadius: 6, padding: 6, zIndex: 15,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  kbWrapper: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
  selectionPanel: {
    backgroundColor: 'white', padding: 16,
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: -2 },
  },
  routingPanel: {
    backgroundColor: 'white', borderTopLeftRadius: 16, borderTopRightRadius: 16,
    padding: 14,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: -2 },
  },
  panelTitle: { fontSize: 18, fontWeight: 'bold' },
  panelAddress: { fontSize: 14, color: 'grey', marginBottom: 8 },
  searchRow: {
    marginTop: 6, marginBottom: 8,
    backgroundColor: '#f4f4f4', borderRadius: 10, paddingHorizontal: 10, height: 40,
    justifyContent: 'center',
  },
  searchInput: { height: 40, fontSize: 15 },
  searchResultsInPanel: {
    maxHeight: 180, marginBottom: 8,
    backgroundColor: 'white', borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#ddd',
  },
  searchResultItem: {
    padding: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ddd',
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'
  },
  emptyResults: { padding: 10, color: '#666' },
  sectionLabel: { marginTop: 6, marginBottom: 4, fontSize: 12, color: '#555' },
  radiusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  radiusChip: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10,
    marginRight: 4, marginBottom: 6, backgroundColor: 'white'
  },
  radiusChipActive: { borderColor: '#1E90FF', backgroundColor: '#E6F2FF' },
  radiusChipText: { fontSize: 12, color: '#333' },
  radiusChipTextActive: { color: '#1E90FF', fontWeight: '600' },
  fitRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6 },
  fitChip: {
    borderWidth: 1, borderColor: '#1E90FF', backgroundColor: '#E6F2FF',
    borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12,
  },
  fitChipText: { color: '#1E90FF', fontWeight: '600', fontSize: 12 },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 10 },
  stopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 2 },
  removeText: { color: 'red', fontSize: 12 },
  locNote: { marginTop: 8, fontSize: 12, color: '#555' },
});

export default MapScreen;
