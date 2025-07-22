const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://hipag-02-default-rtdb.firebaseio.com"
});

const db = admin.database();

// Release dryer/washing machine endpoint
app.get('/api/release', async (req, res) => {
  const REQUIRED_TOKEN = "1be10a9c20528183b64e3c69564db6958eab7f434ee94350706adb4efc261869";
  const token = req.header("X-Token");
  if (token !== REQUIRED_TOKEN) {
    return res.status(401).json({
      error: "Unauthorized: missing or invalid X-Token header"
    });
  }
  try {
    let { store, machine, timmer, softener, dosage } = req.query;

    if (!store || !machine) {
      return res.status(400).json({
        error: 'Missing required parameters',
        required: ['store', 'machine']
      });
    }

    // Handle single values as arrays
    if (!Array.isArray(store)) {
      try { store = JSON.parse(store); if (!Array.isArray(store)) store = [store]; } catch { store = [store]; }
    }
    if (!Array.isArray(machine)) {
      try { machine = JSON.parse(machine); if (!Array.isArray(machine)) machine = [machine]; } catch { machine = [machine]; }
    }
    if (timmer && !Array.isArray(timmer)) {
      try { timmer = JSON.parse(timmer); if (!Array.isArray(timmer)) timmer = [timmer]; } catch { timmer = [timmer]; }
    }
    if (softener && !Array.isArray(softener)) {
      try { softener = JSON.parse(softener); if (!Array.isArray(softener)) softener = [softener]; } catch { softener = [softener]; }
    }
    if (dosage && !Array.isArray(dosage)) {
      try { dosage = JSON.parse(dosage); if (!Array.isArray(dosage)) dosage = [dosage]; } catch { dosage = [dosage]; }
    }

    // Função para aguardar um nó ter valor esperado
    const waitForValue = async (ref, expected, timeoutMs = 15000, intervalMs = 1000) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const value = await ref.once('value').then(snap => snap.val());
        console.log(
          `[DEBUG] Lendo ${ref && ref.path && typeof ref.path.toString === 'function' ? ref.path.toString() : '[path indefinido]'}:`,
          value,
          'esperado:',
          expected
        );
        if (value === expected || value === String(expected)) return true;
        await new Promise(res => setTimeout(res, intervalMs));
      }
      return false;
    };

    // Se softener e dosage existem, fluxo especial para lavadoras + dosadora
    if (softener && dosage) {
      const results = [];
      for (let i = 0; i < machine.length; i++) {
        const storeId = store[i] || store[0];
        const machineId = machine[i];
        const soft = softener[i] || softener[0];
        const dos = dosage[i] || dosage[0];
        // Mapear softener
        let amaciante = 0;
        if (soft === 'floral') amaciante = 1;
        else if (soft === 'sport') amaciante = 2;
        else if (soft === 'nosmell') amaciante = 3;
        // Mapear dosage
        let dosagem = 0;
        if (dos === '1' || dos === 1) dosagem = 1;
        else if (dos === '2' || dos === 2) dosagem = 2;
        // Mapear softener_endpoint
        let softenerEndpoint = '';
        if (soft === 'floral') softenerEndpoint = 'softener1';
        else if (soft === 'sport') softenerEndpoint = 'softener2';
        else if (soft === 'nosmell') softenerEndpoint = 'softener0';
        // Mapear dosagem_endpoint
        let dosagemEndpoint = '';
        if (soft === 'floral' && (dos === '1' || dos === 1)) dosagemEndpoint = 'am01-1';
        else if (soft === 'floral' && (dos === '2' || dos === 2)) dosagemEndpoint = 'am01-2';
        else if (soft === 'sport' && (dos === '1' || dos === 1)) dosagemEndpoint = 'am02-1';
        else if (soft === 'sport' && (dos === '2' || dos === 2)) dosagemEndpoint = 'am02-2';
        // Envia comandos para dosadora (ajustado para subnó da máquina)
        const dosadoraPath = `${storeId}/dosadora_01/${machineId}`;
        // 1. Envia softener_endpoint e dosagem_endpoint primeiro
        await db.ref(`${dosadoraPath}/softener_endpoint`).set(softenerEndpoint);
        await db.ref(`${dosadoraPath}/dosagem_endpoint`).set(dosagemEndpoint);
        // 2. Depois envia amaciante e dosagem
        await db.ref(`${dosadoraPath}/amaciante`).set(amaciante);
        await db.ref(`${dosadoraPath}/dosagem`).set(dosagem);
        // Aguarda status da dosadora ser 'online' (em vez de aguardar dosagem voltar a 0)
        const statusRef = db.ref(`${storeId}/status/dosadoras/${machineId}`);
        const dosadoraOk = await waitForValue(statusRef, 'online', 15000);
        if (!dosadoraOk) {
          results.push({
            store: storeId,
            machine: machineId,
            softener: soft,
            dosage: dos,
            path: `${dosadoraPath}`,
            value: { amaciante, dosagem },
            success: false,
            message: 'Dosadora não está online, lavadora não liberada.'
          });
          continue;
        }
        // Libera lavadora
        const lavadoraPath = `${storeId}/lavadoras/${machineId}`;
        await db.ref(lavadoraPath).set(true);
        // Aguarda lavadora voltar para false
        const lavadoraOk = await waitForValue(db.ref(lavadoraPath), false, 15000);
        results.push({
          store: storeId,
          machine: machineId,
          softener: soft,
          dosage: dos,
          path: lavadoraPath,
          value: true,
          success: lavadoraOk,
          message: lavadoraOk ? 'Lavadora liberada com sucesso.' : 'Lavadora não respondeu, pode estar offline.'
        });
      }
      const now = Date.now();
      const allOk = results.every(r => r.success);
      if (allOk) {
        res.json({
          success: true,
          message: 'Todas as lavadoras liberadas com sucesso.',
          updated_nodes: results,
          timestamp: now
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Uma ou mais lavadoras/dosadoras não responderam.',
          updated_nodes: results,
          timestamp: now
        });
      }
      return;
    }

    // --- Fluxo padrão secadora/lavadora simples ---
    let paths;
    let updated_nodes;
    // Se timmer existe, libera secadora
    if (timmer) {
      paths = machine.map((machineId, index) => {
        const storeId = store[index] || store[0];
        const timer = timmer[index] || timmer[0];
        return `${storeId}/secadoras/${machineId}_${timer}`;
      });
      updated_nodes = machine.map((machineId, index) => {
        const storeId = store[index] || store[0];
        const timer = timmer[index] || timmer[0];
        return {
          store: storeId,
          machine: machineId,
          timer: timer,
          path: `${storeId}/secadoras/${machineId}_${timer}`,
          value: true
        };
      });
    } else { // Se não, libera lavadora simples
      paths = machine.map((machineId, index) => {
        const storeId = store[index] || store[0];
        return `${storeId}/lavadoras/${machineId}`;
      });
      updated_nodes = machine.map((machineId, index) => {
        const storeId = store[index] || store[0];
        return {
          store: storeId,
          machine: machineId,
          path: `${storeId}/lavadoras/${machineId}`,
          value: true
        };
      });
    }

    await Promise.all(paths.map(path => db.ref(path).set(true)));

    // Função para aguardar todos os nós voltarem para false
    const waitForAllFalse = async (refs, timeoutMs = 15000, intervalMs = 500) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const values = await Promise.all(refs.map(ref => ref.once('value').then(snap => snap.val())));
        if (values.every(val => val === false)) return true;
        await new Promise(res => setTimeout(res, intervalMs));
      }
      return false;
    };

    const refs = paths.map(path => db.ref(path));
    const ok = await waitForAllFalse(refs, 15000);
    const now = Date.now();

    if (ok) {
      res.json({
        success: true,
        message: timmer ? "Secadora(s) liberada(s) com sucesso." : "Lavadora(s) liberada(s) com sucesso.",
        updated_nodes,
        timestamp: now
      });
    } else {
      res.status(400).json({
        success: false,
        message: timmer ? "Dispositivo da secadora não respondeu, pode estar offline." : "Dispositivo da lavadora não respondeu, pode estar offline.",
        updated_nodes,
        timestamp: now
      });
    }

  } catch (error) {
    res.status(500).json({
      error: error.message,
      details: 'Error processing release request'
    });
  }
});

// Get all dryers status
app.get('/api/dryers', async (req, res) => {
  try {
    const snapshot = await db.ref('secadoras').once('value');
    const data = snapshot.val();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get specific dryer status
app.get('/api/dryers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const snapshot = await db.ref(`secadoras/${id}`).once('value');
    const data = snapshot.val();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update dryer status
app.put('/api/dryers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    // Validate status
    if (typeof status !== 'boolean') {
      return res.status(400).json({ error: 'Status must be a boolean value' });
    }

    await db.ref(`secadoras/${id}`).update({ status });
    res.json({ id, status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update all dryers status
app.put('/api/dryers', async (req, res) => {
  try {
    const { status } = req.body;
    
    // Validate status
    if (typeof status !== 'boolean') {
      return res.status(400).json({ error: 'Status must be a boolean value' });
    }

    const snapshot = await db.ref('secadoras').once('value');
    const dryers = snapshot.val();
    
    const updates = {};
    Object.keys(dryers).forEach(id => {
      updates[`secadoras/${id}/status`] = status;
    });

    await db.ref().update(updates);
    res.json({ message: 'All dryers updated successfully', status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Routes
app.get('/api/nodes', async (req, res) => {
  try {
    const snapshot = await db.ref('/').once('value');
    const data = snapshot.val();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get specific node
app.get('/api/nodes/:path', async (req, res) => {
  try {
    const path = req.params.path;
    const snapshot = await db.ref(path).once('value');
    const data = snapshot.val();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new node
app.post('/api/nodes/:path', async (req, res) => {
  try {
    const path = req.params.path;
    const data = req.body;
    const ref = db.ref(path);
    const newRef = await ref.push(data);
    res.json({ id: newRef.key, ...data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update node
app.put('/api/nodes/:path/:id', async (req, res) => {
  try {
    const { path, id } = req.params;
    const data = req.body;
    await db.ref(`${path}/${id}`).update(data);
    res.json({ id, ...data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete node
app.delete('/api/nodes/:path/:id', async (req, res) => {
  try {
    const { path, id } = req.params;
    await db.ref(`${path}/${id}`).remove();
    res.json({ message: 'Node deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Novo endpoint para status de máquina específica, dosadora (se lavadora) e power-air
app.get('/api/status', async (req, res) => {
  const { store, machine } = req.query;
  if (!store || !machine) {
    return res.status(400).json({ error: 'Parâmetros store e machine são obrigatórios.' });
  }

  // IDs fixos para lavadoras e secadoras
  const lavadorasIds = ['432', '543', '654'];
  const secadorasIds = ['765', '876', '987'];

  let tipo = null;
  if (lavadorasIds.includes(machine)) tipo = 'lavadora';
  else if (secadorasIds.includes(machine)) tipo = 'secadora';
  else {
    return res.status(400).json({ error: 'ID de máquina não reconhecido.' });
  }

  try {
    let status = null;
    let dosadoraStatus = null;
    if (tipo === 'lavadora') {
      const snap = await db.ref(`${store}/status/lavadoras/${machine}`).once('value');
      status = snap.val() || 'offline';
      // Consulta status da dosadora correspondente
      const dosSnap = await db.ref(`${store}/status/dosadoras/${machine}`).once('value');
      dosadoraStatus = dosSnap.val() || 'offline';
    } else {
      const snap = await db.ref(`${store}/status/secadoras/${machine}`).once('value');
      status = snap.val() || 'offline';
    }

    // Consulta API externa para power-air
    const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
    let powerAir = null;
    try {
      const apiUrl = `https://sistema.lavanderia60minutos.com.br/api/v1/stores/${store}`;
      const response = await fetch(apiUrl, {
        headers: {
          "X-Token": "1be10a9c20528183b64e3c69564db6958eab7f434ee94350706adb4efc261869"
        }
      });
      const data = await response.json();
      powerAir = data?.data?.attributes?.['power-air'] || null;
    } catch (err) {
      powerAir = null;
    }

    const responseObj = {};
    responseObj[tipo] = { [machine]: status };
    if (tipo === 'lavadora') {
      responseObj['dosadora'] = { [machine]: dosadoraStatus };
    }
    responseObj['power-air'] = powerAir;

    // Enviar para Firebase com base no 'power-air'
    if (powerAir === 'low') {
      await db.ref(`${store}/ar_condicionado/18`).set(true);
      console.log(`Enviado para Firebase: ${store}/ar_condicionado/18:true`);
    } else if (powerAir === 'mid') {
      await db.ref(`${store}/ar_condicionado/22`).set(true);
      console.log(`Enviado para Firebase: ${store}/ar_condicionado/22:true`);
    }

    res.json(responseObj);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Set time for dispenser (independent fields, English)
app.post('/api/dosadora/set-time', async (req, res) => {
  const REQUIRED_TOKEN = "1be10a9c20528183b64e3c69564db6958eab7f434ee94350706adb4efc261869";
  const token = req.header("X-Token");
  if (token !== REQUIRED_TOKEN) {
    return res.status(401).json({ error: "Unauthorized: missing or invalid X-Token header" });
  }
  try {
    const { store, machine, soap, softener, sport } = req.body;
    if (!store || !machine) {
      return res.status(400).json({ error: 'Missing required parameters', required: ['store', 'machine'] });
    }
    const dosadoraRef = db.ref(`${store}/dosadora_01/${machine}`);
    const updates = [];
    if (typeof soap !== 'undefined') {
      updates.push(dosadoraRef.child('ajuste_tempo_sabao').set(Number(soap) || 0));
    }
    if (typeof softener !== 'undefined') {
      updates.push(dosadoraRef.child('ajuste_tempo_floral').set(Number(softener) || 0));
    }
    if (typeof sport !== 'undefined') {
      updates.push(dosadoraRef.child('ajuste_tempo_sport').set(Number(sport) || 0));
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No time fields provided. Use soap, softener, or sport.' });
    }
    updates.push(dosadoraRef.child('consulta_tempo').set(true));
    await Promise.all(updates);
    res.json({ success: true, message: 'Time adjustment sent to dispenser.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Pump activation for dispenser (English)
app.post('/api/dosadora/activate-pump', async (req, res) => {
  const REQUIRED_TOKEN = "1be10a9c20528183b64e3c69564db6958eab7f434ee94350706adb4efc261869";
  const token = req.header("X-Token");
  if (token !== REQUIRED_TOKEN) {
    return res.status(401).json({ error: "Unauthorized: missing or invalid X-Token header" });
  }
  try {
    const { store, machine, pump } = req.body;
    if (!store || !machine || typeof pump === 'undefined') {
      return res.status(400).json({ error: 'Missing required parameters', required: ['store', 'machine', 'pump'] });
    }
    const dosadoraRef = db.ref(`${store}/dosadora_01/${machine}`);
    await dosadoraRef.child('bomba').set(Number(pump));
    res.json({ success: true, message: `Pump ${pump} activated on dispenser.` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get current times for dispenser
app.get('/api/dosadora/get-times', async (req, res) => {
  const { store, machine } = req.query;
  if (!store || !machine) {
    return res.status(400).json({ error: 'Missing required parameters', required: ['store', 'machine'] });
  }
  try {
    const dosadoraRef = db.ref(`${store}/dosadora_01/${machine}`);
    const snapshot = await dosadoraRef.once('value');
    const data = snapshot.val() || {};
    res.json({
      soap: data.tempo_atual_sabao ?? null,
      softener: data.tempo_atual_floral ?? null,
      sport: data.tempo_atual_sport ?? null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
}); 