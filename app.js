// LÓGICA DE APLICACIÓN LOGÍSTICA EN FIRESTORE - XURI S.A.

// Referencias DOM
const $ = (id) => document.getElementById(id);
const normalizar = (texto) => texto ? texto.trim().toUpperCase().replace(/\s+/g, ' ') : '';

// Variables globales
let db = null;
let activeConfig = {
  montoLimite: 3000,
  provinciasConCaja: ['GUAYAS', 'EL ORO', 'MANABI', 'LOS RIOS'],
  clientesS04: ['COMERCIAL SUPER MOTO ZHONG', 'GRAN MURALLA'],
  clientesCaja: ['MEGA MOTO STEVEN']
};
let listaPromociones = {};
let currentParsedRows = []; // Para filtros del inspector de Excel

// Cargar la aplicación al iniciar la página
window.addEventListener('DOMContentLoaded', () => {
  inicializarFlujoConfiguracion();
});

// ==========================================
// SECCIÓN 1: CONFIGURACIÓN E INICIALIZACIÓN
// ==========================================
function inicializarFlujoConfiguracion() {
  // 1. Comprobar si existe configuración en config.js cargada en memoria
  if (typeof firebaseConfig !== 'undefined' && firebaseConfig.apiKey && firebaseConfig.apiKey !== 'TU_API_KEY_AQUI') {
    conectarFirebase(firebaseConfig);
    return;
  }

  // 2. Comprobar si hay una configuración en el LocalStorage
  const localConfigStr = localStorage.getItem('xuri_firebase_config');
  if (localConfigStr) {
    try {
      const config = JSON.parse(localConfigStr);
      conectarFirebase(config);
    } catch(e) {
      console.error("Error cargando configuración guardada", e);
      mostrarSetupInicial();
    }
  } else {
    mostrarSetupInicial();
  }
}

function mostrarSetupInicial() {
  $('setup-container').classList.remove('oculto');
  $('login-container').classList.add('oculto');
  $('main-app').classList.add('oculto');
}

function guardarSetupFirebase() {
  const inputStr = $('firebaseConfigInput').value.trim();
  if (!inputStr) return alert("Por favor, ingrese un JSON de configuración válido.");
  try {
    const config = JSON.parse(inputStr);
    if (!config.apiKey || !config.projectId) {
      throw new Error("El JSON no tiene todos los campos obligatorios (apiKey, projectId).");
    }
    localStorage.setItem('xuri_firebase_config', JSON.stringify(config));
    location.reload();
  } catch(e) {
    alert("Error al parsear el JSON de configuración: " + e.message);
  }
}

function desconectarFirebase() {
  if (confirm("¿Estás seguro de que quieres desconectar el sistema de Firebase? Se borrarán las credenciales locales de este navegador.")) {
    localStorage.removeItem('xuri_firebase_config');
    firebase.auth().signOut().then(() => {
      location.reload();
    });
  }
}

// ==========================================
// SECCIÓN 2: CONEXIÓN A FIREBASE Y AUTH (FIRESTORE)
// ==========================================
function conectarFirebase(config) {
  try {
    // Inicializar Firebase
    firebase.initializeApp(config);
    db = firebase.firestore();
    
    // Control de estado de autenticación
    firebase.auth().onAuthStateChanged((user) => {
      if (user) {
        verificarRolYAcceder(user);
      } else {
        mostrarLogin();
      }
    });
  } catch(err) {
    console.error("Error inicializando Firebase", err);
    alert("Error al conectar con Firebase: " + err.message + "\nPor favor, verifica tus credenciales.");
    mostrarSetupInicial();
  }
}

function mostrarLogin() {
  $('setup-container').classList.add('oculto');
  $('login-container').classList.remove('oculto');
  $('main-app').classList.add('oculto');
  
  // Comprobar si existen usuarios registrados en la base de datos (Cold Start)
  db.collection('usuarios').limit(1).get()
    .then((querySnapshot) => {
      if (querySnapshot.empty) {
        $('firstTimeAdminBox').classList.remove('oculto');
      } else {
        $('firstTimeAdminBox').classList.add('oculto');
      }
    })
    .catch(err => {
      console.error("Error al comprobar existencia de usuarios", err);
    });
}

// Manejar Login
$('loginForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const email = $('loginEmail').value.trim();
  const password = $('loginPassword').value;
  
  firebase.auth().signInWithEmailAndPassword(email, password)
    .catch(err => {
      alert("Error de autenticación: " + err.message);
    });
});

function cerrarSesion() {
  firebase.auth().signOut();
}

function verificarRolYAcceder(user) {
  const emailNorm = String(user.email || '').toLowerCase().trim();
  
  db.collection('usuarios').doc(user.uid).get()
    .then((doc) => {
      let rol = null;
      if (doc.exists) {
        rol = doc.data().rol;
      } else {
        // Asignación automática de roles basándonos en los correos del cliente
        if (emailNorm === 'admlogistica@gmail.com') {
          rol = 'admin';
        } else if (emailNorm === 'logisticaxuri@gmail.com') {
          rol = 'operador';
        } else {
          rol = 'operador'; // Rol por defecto
        }
        // Guardar el rol en Firestore de forma automática
        db.collection('usuarios').doc(user.uid).set({ rol: rol, email: emailNorm });
      }
      
      // Ajustar visualización según rol
      if (rol === 'admin') {
        $('btnTabPromociones').classList.remove('oculto');
        $('btnTabAjustes').classList.remove('oculto');
      } else {
        $('btnTabPromociones').classList.add('oculto');
        $('btnTabAjustes').classList.add('oculto');
      }
      
      // Cargar datos del negocio
      cargarDatosNegocio();
    })
    .catch(err => {
      console.error("Error al verificar rol de usuario", err);
      // Fallback a operador en caso de error
      cargarDatosNegocio();
    });
}

// Registrar Administrador Inicial (Cold Start)
function crearAdminInicial() {
  const email = prompt("Ingrese el correo electrónico del administrador inicial:");
  if (!email) return;
  const password = prompt("Ingrese la contraseña del administrador inicial (mínimo 6 caracteres):");
  if (!password || password.length < 6) return alert("Contraseña inválida o muy corta.");
  
  firebase.auth().createUserWithEmailAndPassword(email, password)
    .then((userCredential) => {
      const uid = userCredential.user.uid;
      // Guardar rol admin en Firestore
      return db.collection('usuarios').doc(uid).set({ rol: 'admin' });
    })
    .then(() => {
      // Inicializar base de datos con reglas por defecto en Firestore
      return db.collection('configuracion').doc('reglas').set(activeConfig);
    })
    .then(() => {
      alert("¡Administrador registrado e inicializado con éxito!");
      location.reload();
    })
    .catch(err => {
      alert("Error al crear cuenta inicial: " + err.message);
    });
}

// ==========================================
// SECCIÓN 3: MANEJO DE CONFIGURACIÓN Y PROMOS
// ==========================================
function cargarDatosNegocio() {
  // Escuchar cambios en reglas en Firestore (/configuracion/reglas)
  db.collection('configuracion').doc('reglas').onSnapshot((doc) => {
    if (doc.exists) {
      const val = doc.data();
      activeConfig.montoLimite = Number(val.montoLimite) || 3000;
      activeConfig.provinciasConCaja = val.provinciasConCaja || [];
      activeConfig.clientesS04 = val.clientesS04 || [];
      activeConfig.clientesCaja = val.clientesCaja || [];
      
      // Llenar datos en panel de ajustes por si es admin
      llenarPanelAjustesInputs();
    } else {
      // Si no existe la configuración, y el usuario actual es admin, la inicializamos automáticamente
      const currentUser = firebase.auth().currentUser;
      if (currentUser) {
        db.collection('usuarios').doc(currentUser.uid).get().then((uDoc) => {
          if (uDoc.exists && uDoc.data().rol === 'admin') {
            db.collection('configuracion').doc('reglas').set(activeConfig);
          }
        });
      }
    }
    
    // Escuchar cambios en promociones en Firestore
    db.collection('promociones').onSnapshot((querySnapshot) => {
      listaPromociones = {};
      querySnapshot.forEach((doc) => {
        listaPromociones[doc.id] = doc.data();
      });
      renderListaPromociones();
      
      // Mostrar la aplicación principal
      $('setup-container').classList.add('oculto');
      $('login-container').classList.add('oculto');
      $('main-app').classList.remove('oculto');
    }, (err) => {
      console.error("Error al escuchar promociones", err);
    });
  }, (err) => {
    console.error("Error al escuchar configuración", err);
  });
}

function llenarPanelAjustesInputs() {
  if ($('cfgMontoLimite')) {
    $('cfgMontoLimite').value = activeConfig.montoLimite;
    $('cfgClientesS04').value = activeConfig.clientesS04.join('\n');
    $('cfgClientesCaja').value = activeConfig.clientesCaja.join('\n');
    $('cfgProvinciasCaja').value = activeConfig.provinciasConCaja.join('\n');
  }
}

function guardarAjustesConfig() {
  const configObj = {
    montoLimite: Number($('cfgMontoLimite').value) || 3000,
    clientesS04: $('cfgClientesS04').value.split('\n').map(x => x.trim()).filter(Boolean),
    clientesCaja: $('cfgClientesCaja').value.split('\n').map(x => x.trim()).filter(Boolean),
    provinciasConCaja: $('cfgProvinciasCaja').value.split('\n').map(x => x.trim()).filter(Boolean)
  };

  db.collection('configuracion').doc('reglas').set(configObj)
    .then(() => {
      alert("¡Ajustes guardados con éxito en Firebase!");
    })
    .catch(err => {
      alert("Error al guardar ajustes: " + err.message);
    });
}

// Registrar cuentas de operadores por administrador
function registrarNuevoOperador() {
  const email = $('newUserEmail').value.trim();
  const password = $('newUserPassword').value;
  const rol = $('newUserRole').value;

  if (!email || !password || password.length < 6) {
    return alert("Por favor complete los campos. La contraseña debe tener al menos 6 caracteres.");
  }

  // Truco: inicializar una instancia de Firebase temporal para no desloguear al administrador actual
  const localConfigStr = localStorage.getItem('xuri_firebase_config') || JSON.stringify(firebaseConfig);
  const config = JSON.parse(localConfigStr);
  
  const tempApp = firebase.initializeApp(config, "TempRegistration");
  
  tempApp.auth().createUserWithEmailAndPassword(email, password)
    .then((userCredential) => {
      const uid = userCredential.user.uid;
      // Guardar rol en la base de datos usando la conexión principal (Firestore)
      return db.collection('usuarios').doc(uid).set({ rol: rol });
    })
    .then(() => {
      alert(`Usuario ${email} registrado con rol ${rol.toUpperCase()}`);
      $('newUserEmail').value = '';
      $('newUserPassword').value = '';
      tempApp.delete();
    })
    .catch(err => {
      alert("Error registrando usuario: " + err.message);
      tempApp.delete();
    });
}

// ==========================================
// SECCIÓN 4: PESTAÑAS (NAVEGACIÓN)
// ==========================================
function cambiarPestaña(targetTab) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.add('oculto'));
  
  // Activar botón pulsado
  const btn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.textContent.toLowerCase().includes(targetTab.substring(0,4)));
  if (btn) btn.classList.add('active');
  
  // Mostrar contenedor de la pestaña
  $('content-' + targetTab).classList.remove('oculto');
}

// ==========================================
// SECCIÓN 5: LÓGICA DEL CLASIFICADOR (ORIGINAL MIGRADA)
// ==========================================
function alternar(id, mostrar) { $(id).classList.toggle('oculto', !mostrar); }
function limpiarResultado() { alternar('resultado', false); }

function actualizarVista() {
  const sistema = $('sistema').value;
  alternar('datosAlexis', sistema === 'ALEXIS');
  alternar('datosVentas', sistema === 'VENTAS');
  actualizarAlexis();
  actualizarVentas();
  limpiarResultado();
}

function actualizarAlexis() {
  const cliente = normalizar($('cliente').value);
  if ($('sistema').value !== 'ALEXIS' || cliente === '') {
    alternar('datosAlexisNormal', false);
    alternar('tipoCajaAlexis', false);
    alternar('cantidadesMixtas', false);
    alternar('historialAlexis', false);
    return;
  }

  // Mapear clientes especiales usando configuración dinámica de Firebase
  const esClienteS04 = activeConfig.clientesS04.map(c => normalizar(c)).includes(cliente);
  const esClienteCajaDirecto = activeConfig.clientesCaja.map(c => normalizar(c)).includes(cliente);
  
  const normal = !esClienteS04 && !esClienteCajaDirecto;
  alternar('datosAlexisNormal', normal);
  
  // Mostrar caja si es cliente directo o si es normal y la provincia requiere caja
  const provincia = normalizar($('provincia').value);
  const provRequiereCaja = activeConfig.provinciasConCaja.map(p => normalizar(p)).includes(provincia);
  
  const mostrarCaja = esClienteCajaDirecto || (normal && provRequiereCaja);
  alternar('tipoCajaAlexis', mostrarCaja);
  alternar('cantidadesMixtas', mostrarCaja && $('cajaAlexis').value === 'MIXTAS');
  alternar('historialAlexis', normal && Number($('montoAlexis').value) > activeConfig.montoLimite);
}

function actualizarVentas() {
  const aplicaServicio = $('sistema').value === 'VENTAS' && $('montoVentas').value !== '' && Number($('montoVentas').value) <= activeConfig.montoLimite;
  alternar('servicioVentas', aplicaServicio);
  alternar('destinoLaar', aplicaServicio && $('servicio').value === 'LAAR');
  alternar('tipoTramaco', aplicaServicio && $('servicio').value === 'TRAMACO');
}

function mostrar(codigo, explicacion) {
  $('codigo').textContent = codigo;
  $('explicacion').textContent = explicacion;
  alternar('resultado', true);
}

// Event Listeners del clasificador
$('sistema').addEventListener('change', actualizarVista);
['cliente', 'provincia', 'montoAlexis'].forEach(id => $(id).addEventListener('input', actualizarAlexis));
$('cajaAlexis').addEventListener('change', actualizarAlexis);
$('montoVentas').addEventListener('input', actualizarVentas);
$('servicio').addEventListener('change', actualizarVentas);

$('formulario').addEventListener('submit', (evento) => {
  evento.preventDefault();
  const sistema = $('sistema').value;
  if (!sistema) return mostrar('—', 'Seleccione un sistema.');

  if (sistema === 'ALEXIS') {
    const cliente = normalizar($('cliente').value);
    if (!cliente) return mostrar('—', 'Ingrese el nombre del cliente.');
    
    // 1. Cliente especial directo S-04
    if (activeConfig.clientesS04.map(c => normalizar(c)).includes(cliente))
      return mostrar('S-04', 'Cliente especial con código directo S-04.');

    // 2. Cliente de caja directo
    if (activeConfig.clientesCaja.map(c => normalizar(c)).includes(cliente)) {
      const caja = codigoPorCaja();
      if (!caja) return;
      return mostrar(caja.codigo, cliente + ': ' + caja.explicacion);
    }

    // 3. Cliente normal
    const provincia = normalizar($('provincia').value);
    const monto = $('montoAlexis').value;
    if (!provincia || monto === '') return mostrar('—', 'Ingrese la provincia y el valor del pedido.');
    
    let codigo = 'S-01';
    let explicacion = 'Provincia fuera del listado configurado (' + activeConfig.provinciasConCaja.join(', ') + ').';
    
    const provRequiereCaja = activeConfig.provinciasConCaja.map(p => normalizar(p)).includes(provincia);
    if (provRequiereCaja) {
      const caja = codigoPorCaja();
      if (!caja) return;
      codigo = caja.codigo;
      explicacion = caja.explicacion;
    }
    
    if (Number(monto) > activeConfig.montoLimite) {
      if (!$('s04Previo').value) return mostrar('—', 'Indique si el cliente tiene S-04 en pedidos anteriores mayores a $' + activeConfig.montoLimite + '.');
      if ($('s04Previo').value === 'SI') return mostrar('S-04', 'Pedido mayor a $' + activeConfig.montoLimite + ' y cliente con historial S-04.');
      explicacion += ' Pedido mayor a $' + activeConfig.montoLimite + ' sin historial S-04: se conserva el código base.';
    }
    return mostrar(codigo, explicacion);
  }

  // Sistema VENTAS
  const monto = $('montoVentas').value;
  if (monto === '') return mostrar('—', 'Ingrese el valor del pedido.');
  if (Number(monto) > activeConfig.montoLimite) return mostrar('S-04', 'Pedido de VENTAS mayor a $' + activeConfig.montoLimite + '.');
  
  const servicio = $('servicio').value;
  if (!servicio) return mostrar('—', 'Seleccione el servicio.');
  if (servicio === 'OTRO') return mostrar('S-05', 'Servicio distinto de LAAR y TRAMACO.');
  
  if (servicio === 'LAAR') {
    const destino = $('destinoLaarSelect').value;
    if (!destino) return mostrar('—', 'Seleccione el destino o tipo de LAAR.');
    return mostrar(['ORIENTE', 'ESPECIAL'].includes(destino) ? 'S-06' : 'S-01',
      ['ORIENTE', 'ESPECIAL'].includes(destino) ? 'LAAR para ORIENTE o ESPECIAL.' : 'LAAR para P/S/G u otro destino.');
  }
  
  const tipo = $('tipoTramacoSelect').value;
  if (!tipo) return mostrar('—', 'Seleccione el tipo de TRAMACO.');
  return mostrar(['TE', 'TD'].includes(tipo) ? 'S-06' : 'S-01',
    ['TE', 'TD'].includes(tipo) ? 'TRAMACO tipo TE o TD.' : 'TRAMACO tipo CP u otro.');
});

function codigoPorCaja() {
  const tipo = $('cajaAlexis').value;
  if (!tipo) { mostrar('—', 'Seleccione el tipo de caja.'); return null; }
  if (tipo === 'SOLO') return { codigo: 'S-03', explicacion: 'Código S-03 para caja SOLO.' };
  if (tipo === 'LIO') return { codigo: 'S-02', explicacion: 'Código S-02 para cajas LIO.' };
  const solo = Number($('cantidadSolo').value);
  const lio = Number($('cantidadLio').value);
  if (!Number.isInteger(solo) || solo < 1 || !Number.isInteger(lio) || lio < 1) {
    mostrar('—', 'Para CAJAS MIXTAS, ingrese cantidades válidas (mínimo 1) de SOLO y LIO.');
    return null;
  }
  return {
    codigo: 'S-03 + S-02',
    explicacion: 'Cajas mixtas: S-03 para ' + solo + ' caja(s) SOLO y S-02 para ' + lio + ' caja(s) LIO.'
  };
}

// ==========================================
// SECCIÓN 6: INSPECTOR BATCH EXCEL
// ==========================================
const dropZone = $('excelDropZone');

// Eventos Drag & Drop
if (dropZone) {
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    }, false);
  });

  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length) procesarArchivoExcel(files[0]);
  });

  $('excelFileInput').addEventListener('change', (e) => {
    if (e.target.files.length) procesarArchivoExcel(e.target.files[0]);
  });
}

function procesarArchivoExcel(file) {
  $('dropZoneText').textContent = "Cargando archivo: " + file.name + "...";
  const reader = new FileReader();
  
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      analizarFilasExcel(rows);
      $('dropZoneText').innerHTML = `Archivo analizado: <strong>${file.name}</strong>. Cargar otro archivo.`;
    } catch(err) {
      alert("Error leyendo el archivo Excel: " + err.message);
      $('dropZoneText').textContent = "Arrastre el archivo Excel aquí o haga clic para buscar";
    }
  };
  
  reader.readAsArrayBuffer(file);
}

function analizarFilasExcel(rows) {
  if (rows.length < 2) {
    return alert("El archivo está vacío o no contiene suficientes filas de datos.");
  }

  // Mapeo automático de columnas basándonos en cabeceras en fila 1
  let colIdxDesc = 0;
  let colIdxCodigo = 1;
  let colIdxPrecio = 4;

  const headers = rows[0].map(h => String(h || '').toLowerCase().trim());
  
  // Buscar código
  const codeHeaderIdx = headers.findIndex(h => h.includes('código') || h.includes('codigo') || h.includes('货号') || h.includes('ref') || h.includes('item'));
  if (codeHeaderIdx !== -1) colIdxCodigo = codeHeaderIdx;
  
  // Buscar descripción
  const descHeaderIdx = headers.findIndex(h => h.includes('desc') || h.includes('nombre') || h.includes('producto') || h.includes('产品'));
  if (descHeaderIdx !== -1) colIdxDesc = descHeaderIdx;
  
  // Buscar precio
  const priceHeaderIdx = headers.findIndex(h => h.includes('precio') || h.includes('valor') || h.includes('价格') || h.includes('price'));
  if (priceHeaderIdx !== -1) colIdxPrecio = priceHeaderIdx;

  currentParsedRows = [];
  let totalCount = 0;
  let warningsCount = 0;
  let alertsCount = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const rawCodigo = String(row[colIdxCodigo] || '').trim();
    if (!rawCodigo) continue; // Salta líneas vacías

    totalCount++;
    const descripcion = String(row[colIdxDesc] || 'Sin descripción').trim();
    const precioCargado = row[colIdxPrecio] !== undefined ? Number(row[colIdxPrecio]) : null;

    const promoItem = listaPromociones[rawCodigo.toUpperCase()];
    let status = 'INFO'; 
    let precioPromo = null;

    if (promoItem) {
      precioPromo = Number(promoItem.precio);
      
      if (precioCargado === null || isNaN(precioCargado) || precioCargado === 0) {
        status = 'WARN'; 
        warningsCount++;
      } else if (Math.abs(precioCargado - precioPromo) > 0.009) {
        status = 'CRITIC'; 
        alertsCount++;
      } else {
        status = 'OK'; 
      }
    }

    currentParsedRows.push({
      fila: i + 1, 
      codigo: rawCodigo,
      descripcion: descripcion,
      precioCargado: precioCargado,
      precioPromo: precioPromo,
      status: status
    });
  }

  // Actualizar resumen
  $('summaryTotalCount').textContent = totalCount;
  $('summaryWarningsCount').textContent = warningsCount;
  $('summaryAlertsCount').textContent = alertsCount;
  
  $('inspectorResultados').classList.remove('oculto');
  filtrarResultadosBatch();
}

function filtrarResultadosBatch() {
  const showOnlyAlerts = $('chkShowOnlyAlerts').checked;
  const tbody = $('tblInspector').querySelector('tbody');
  tbody.innerHTML = '';

  const filasFiltradas = currentParsedRows.filter(r => {
    if (showOnlyAlerts) {
      return r.status !== 'INFO';
    }
    return true;
  });

  if (filasFiltradas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--text-muted);">No se encontraron discrepancias. Todo correcto.</td></tr>`;
    return;
  }

  filasFiltradas.forEach(r => {
    let badgeHtml = '';
    if (r.status === 'OK') badgeHtml = '<span class="badge correcto">Promo OK</span>';
    else if (r.status === 'WARN') badgeHtml = '<span class="badge advertencia">Precio vacío</span>';
    else if (r.status === 'CRITIC') badgeHtml = '<span class="badge critico">Precio Incorrecto</span>';
    else badgeHtml = '<span class="badge info">Regular</span>';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.fila}</td>
      <td style="font-family: monospace; font-weight: bold;">${r.codigo}</td>
      <td>${r.descripcion}</td>
      <td>${r.precioCargado !== null ? '$' + r.precioCargado.toFixed(2) : '—'}</td>
      <td>${r.precioPromo !== null ? '$' + r.precioPromo.toFixed(2) : '—'}</td>
      <td>${badgeHtml}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ==========================================
// SECCIÓN 7: GESTIÓN DE PROMOCIONES (CRUD)
// ==========================================
function renderListaPromociones() {
  const tbody = $('tblPromociones').querySelector('tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  const query = $('searchPromosInput').value.toLowerCase().trim();
  const keys = Object.keys(listaPromociones);

  let counter = 0;
  keys.forEach(key => {
    const item = listaPromociones[key];
    if (query && !item.codigo.toLowerCase().includes(query) && !item.descripcion.toLowerCase().includes(query)) {
      return; 
    }

    counter++;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-family: monospace; font-weight: bold;">${item.codigo}</td>
      <td>${item.descripcion}</td>
      <td style="font-weight: 600;">$${Number(item.precio).toFixed(2)}</td>
      <td style="text-align: center;">
        <div class="action-icons">
          <button class="action-icon action-edit" onclick="iniciarEdicionPromo('${key}')" title="Editar">✏️</button>
          <button class="action-icon action-delete" onclick="eliminarPromocion('${key}')" title="Eliminar">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  if (counter === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--text-muted);">No hay productos en promoción registrados.</td></tr>`;
  }
}

function guardarPromocion() {
  const codigoRaw = $('promoCodigo').value.trim();
  const descripcion = $('promoDescripcion').value.trim();
  const precio = Number($('promoPrecio').value);
  const editKey = $('editPromoKey').value;

  if (!codigoRaw || !descripcion || isNaN(precio) || precio < 0) {
    return alert("Por favor, ingrese un código, descripción y precio promocional válidos.");
  }

  const codigo = codigoRaw.toUpperCase();
  const payload = {
    codigo: codigo,
    descripcion: descripcion,
    precio: precio
  };

  if (editKey) {
    db.collection('promociones').doc(editKey).update(payload)
      .then(() => {
        cancelarEdicionPromo();
      })
      .catch(err => alert("Error al editar promoción: " + err.message));
  } else {
    db.collection('promociones').doc(codigo).set(payload)
      .then(() => {
        limpiarCamposPromo();
      })
      .catch(err => alert("Error al guardar promoción: " + err.message));
  }
}

function iniciarEdicionPromo(key) {
  const item = listaPromociones[key];
  if (!item) return;

  $('editPromoKey').value = key;
  $('promoCodigo').value = item.codigo;
  $('promoDescripcion').value = item.descripcion;
  $('promoPrecio').value = item.precio;

  $('formPromoTitle').textContent = "Editar producto promocional";
  $('btnGuardarPromo').textContent = "Guardar Cambios";
  $('btnCancelarEditPromo').classList.remove('oculto');
  $('promoCodigo').disabled = true; 
}

function cancelarEdicionPromo() {
  limpiarCamposPromo();
  $('formPromoTitle').textContent = "Añadir nuevo producto promocional";
  $('btnGuardarPromo').textContent = "Agregar Promoción";
  $('btnCancelarEditPromo').classList.add('oculto');
  $('promoCodigo').disabled = false;
}

function limpiarCamposPromo() {
  $('editPromoKey').value = '';
  $('promoCodigo').value = '';
  $('promoDescripcion').value = '';
  $('promoPrecio').value = '';
}

function eliminarPromocion(key) {
  if (confirm(`¿Estás seguro de que quieres eliminar el código ${key} de la lista de promociones?`)) {
    db.collection('promociones').doc(key).delete()
      .catch(err => alert("Error al eliminar: " + err.message));
  }
}

function procesarCargaRapidaPromos() {
  const texto = $('txtCargaRapida').value.trim();
  if (!texto) return alert("Por favor pegue filas de datos.");

  const filas = texto.split('\n');
  const batch = db.batch();
  let count = 0;

  filas.forEach(fila => {
    const celdas = fila.split('\t'); 
    if (celdas.length < 2) return; 

    const codigo = celdas[0].trim().toUpperCase();
    const descripcion = celdas[1].trim();
    const precio = celdas[2] ? Number(celdas[2].replace('$', '').trim()) : 0;

    if (codigo && descripcion) {
      const docRef = db.collection('promociones').doc(codigo);
      batch.set(docRef, {
        codigo: codigo,
        descripcion: descripcion,
        precio: isNaN(precio) ? 0 : precio
      });
      count++;
    }
  });

  if (count === 0) return alert("No se detectaron datos legibles. Verifique que los campos estén separados por columnas (Tabulación).");

  batch.commit()
    .then(() => {
      alert(`¡Se importaron ${count} productos promocionales con éxito!`);
      $('txtCargaRapida').value = '';
      $('txtAreaImportBatch').classList.add('oculto');
    })
    .catch(err => alert("Error en importación masiva: " + err.message));
}
