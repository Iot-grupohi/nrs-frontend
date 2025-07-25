// Configuração do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyC2wdGyqHKntFJKgjbu8gx2L0Fi740Ws7w",
  authDomain: "hipag-02.firebaseapp.com",
  databaseURL: "https://hipag-02-default-rtdb.firebaseio.com",
  projectId: "hipag-02",
  storageBucket: "hipag-02.appspot.com",
  messagingSenderId: "1096728529428",
  appId: "1:1096728529428:web:6f8be1d07a713a223d3501"
};

// Inicializa o Firebase
firebase.initializeApp(firebaseConfig);

// Inicializa o Firestore
const db = firebase.firestore();

// Torna db disponível globalmente (caso necessário)
window.db = db;
