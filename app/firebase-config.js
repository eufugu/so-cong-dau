// Cấu hình Firebase cho app.
// Chạy trên máy này (localhost) thì luôn nối vào emulator với dự án giả, nên không bao giờ chạm vào sổ thật.
(function () {
  var host = location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    window.SO_EMULATOR = true;
    window.SO_FIREBASE_CONFIG = { apiKey: "fake-api-key", authDomain: "demo-so-cong-dau.firebaseapp.com", projectId: "demo-so-cong-dau" };
  } else {
    // To deploy your own copy, paste your Firebase web app config here (see docs/firebase-setup.md).
    // These values are public by design; the Firestore security rules are what protect the data.
    window.SO_FIREBASE_CONFIG = {
      apiKey: "YOUR_API_KEY",
      authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
      projectId: "YOUR_PROJECT_ID",
      storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
      messagingSenderId: "YOUR_SENDER_ID",
      appId: "YOUR_APP_ID",
    };
  }
})();
