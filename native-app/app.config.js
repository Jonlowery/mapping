export default {
  expo: {
    name: "mapping-app-test",
    slug: "mapping-app-test",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "nativeapp",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.jonlowery.mappingapp",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/images/adaptive-icon.png",
        backgroundColor: "#ffffff"
      },
      edgeToEdgeEnabled: true,
      package: "com.jonlowery.mappingapp"
    },
    web: {
      bundler: "metro",
      output: "static",
      favicon: "./assets/images/favicon.png"
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff"
        }
      ]
    ],
    experiments: {
      typedRoutes: true
    },
    // --- THIS SECTION IS UPDATED FOR PRODUCTION ---
    extra: {
      API_URL: "https://mapping-lihi.onrender.com", // <-- UPDATED LIVE URL
      eas: {
        projectId: "41d2b3a8-8a3d-4957-bace-02264a8334a7"
      }
    },
    // ------------------------------------------
    updates: {
      url: "https://u.expo.dev/41d2b3a8-8a3d-4957-bace-02264a8334a7"
    },
    runtimeVersion: {
      policy: "appVersion"
    }
  }
};