// Referência ao banco de dados do Firebase
const database = firebase.database();

// Constantes para o cache
const CACHE_KEY_LOJAS = 'cached_lojas_data';
const CACHE_KEY_TIMESTAMP = 'cached_lojas_timestamp';
const CACHE_EXPIRY_TIME = 30 * 60 * 1000; // 30 minutos em milissegundos

// Constantes para os filtros salvos
const FILTERS_KEY = 'saved_lojas_filters';

// Elementos do DOM
const lojasTableBody = document.getElementById('lojas-table-body');
const loadingRow = document.getElementById('loading-row');
const lojaRowTemplate = document.getElementById('loja-row-template');
const searchInput = document.getElementById('search-input');
const regionFilter = document.getElementById('region-filter');
const stateFilter = document.getElementById('state-filter');
const statusFilter = document.getElementById('status-filter');
const totemFilter = document.getElementById('totem-filter');
const clearFiltersBtn = document.getElementById('clear-filters');
const storeCountElement = document.getElementById('store-count');
const confirmBatchResetBtn = document.getElementById('confirm-batch-reset');

// Elementos das listas de problemas
const lojasOfflineBadge = document.getElementById('lojas-offline-badge');
const lojasOfflineList = document.getElementById('lojas-offline-list');
const noLojasOffline = document.getElementById('no-lojas-offline');
const totemsOfflineBadge = document.getElementById('totems-offline-badge');
const totemsOfflineList = document.getElementById('totems-offline-list');
const noTotemsOffline = document.getElementById('no-totems-offline');

// Elementos de filtro das listas de problemas
const lojasOfflineRegiao = document.getElementById('lojas-offline-regiao');
const lojasOfflineEstado = document.getElementById('lojas-offline-estado');
const totemsOfflineRegiao = document.getElementById('totems-offline-regiao');
const totemsOfflineEstado = document.getElementById('totems-offline-estado');

// Elementos de Abas
const cardsTab = document.getElementById('cards-tab');
const tableTab = document.getElementById('table-tab');
const cardsView = document.getElementById('cards-view');
const tableView = document.getElementById('table-view');

// Elementos para estatísticas de lojas
const lojasOnlineCount = document.getElementById('lojas-online-count');
const lojasOnlinePercent = document.getElementById('lojas-online-percent');
const lojasOfflineCount = document.getElementById('lojas-offline-count');
const lojasOfflinePercent = document.getElementById('lojas-offline-percent');
const lojasOnlineProgress = document.getElementById('lojas-online-progress');

// Elementos para estatísticas de totems
const totemsOnlineCount = document.getElementById('totems-online-count');
const totemsOnlinePercent = document.getElementById('totems-online-percent');
const totemsOfflineCount = document.getElementById('totems-offline-count');
const totemsOfflinePercent = document.getElementById('totems-offline-percent');
const totemsOnlineProgress = document.getElementById('totems-online-progress');

// Elementos para o modal de reset em lote
const resetScopeFiltered = document.getElementById('resetScopeFiltered');
const resetScopeRegion = document.getElementById('resetScopeRegion');
const resetScopeState = document.getElementById('resetScopeState');
const resetRegionContainer = document.getElementById('resetRegionContainer');
const resetStateContainer = document.getElementById('resetStateContainer');
const resetRegion = document.getElementById('resetRegion');
const resetState = document.getElementById('resetState');
const resetType = document.getElementById('resetType');
const affectedStoresCount = document.getElementById('affected-stores-count');

// Armazenar todas as lojas para filtrar
let todasLojas = [];
let lojasFiltradas = [];
let lojasTable; // Para a instância do DataTable
let cacheUsado = false; // Flag para indicar se os dados vieram do cache

// Mapa de regiões e estados do Brasil
const estadosPorRegiao = {
    'norte': ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO'],
    'nordeste': ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
    'centro-oeste': ['DF', 'GO', 'MT', 'MS'],
    'sudeste': ['ES', 'MG', 'RJ', 'SP'],
    'sul': ['PR', 'RS', 'SC']
};

// Coordenadas para posicionar os marcadores no mapa
const coordenadasEstados = {
    // Norte
    'AC': [-9.0238, -70.812],
    'AM': [-3.4168, -65.8561],
    'AP': [1.4136, -51.7979],
    'PA': [-3.9784, -52.8151],
    'RO': [-10.9443, -62.8277],
    'RR': [1.9981, -61.3947],
    'TO': [-10.1753, -48.2982],
    // Nordeste
    'AL': [-9.5713, -36.7819],
    'BA': [-12.5797, -41.7007],
    'CE': [-5.4984, -39.3206],
    'MA': [-5.2927, -45.6166],
    'PB': [-7.0577, -36.5703],
    'PE': [-8.4117, -37.5919],
    'PI': [-7.7183, -42.7289],
    'RN': [-5.8122, -36.5389],
    'SE': [-10.6809, -37.4346],
    // Centro-Oeste
    'DF': [-15.83, -47.86],
    'GO': [-15.827, -49.8362],
    'MT': [-12.6819, -56.9211],
    'MS': [-20.4428, -54.6466],
    // Sudeste
    'ES': [-19.1834, -40.3089],
    'MG': [-18.512, -44.555],
    'RJ': [-22.9068, -43.1729],
    'SP': [-23.5505, -46.6333],
    // Sul
    'PR': [-25.2521, -52.0215],
    'RS': [-30.0346, -51.2177],
    'SC': [-27.2423, -50.2189]
};

// Mapa de estados para nomes completos
const estadosNomes = {
    'AC': 'Acre',
    'AL': 'Alagoas',
    'AM': 'Amazonas',
    'AP': 'Amapá',
    'BA': 'Bahia',
    'CE': 'Ceará',
    'DF': 'Distrito Federal',
    'ES': 'Espírito Santo',
    'GO': 'Goiás',
    'MA': 'Maranhão',
    'MG': 'Minas Gerais',
    'MS': 'Mato Grosso do Sul',
    'MT': 'Mato Grosso',
    'PA': 'Pará',
    'PB': 'Paraíba',
    'PE': 'Pernambuco',
    'PI': 'Piauí',
    'PR': 'Paraná',
    'RJ': 'Rio de Janeiro',
    'RN': 'Rio Grande do Norte',
    'RO': 'Rondônia',
    'RR': 'Roraima',
    'RS': 'Rio Grande do Sul',
    'SC': 'Santa Catarina',
    'SE': 'Sergipe',
    'SP': 'São Paulo',
    'TO': 'Tocantins'
};

// Variável global para o mapa Leaflet
let brasilMap;
// Variável para os marcadores no mapa
let mapMarkers = [];

// Flag para controlar carregamento
let lojasBeingLoaded = false;

// Flag para controlar processamento
let processamentoEmAndamento = false;

// Função para formatar a data
function formatarData(timestamp) {
    try {
        // Se for uma string, converter para número
        if (typeof timestamp === 'string') {
            timestamp = Number(timestamp);
        }
        
        // Se não for um número, tentar converter
        if (typeof timestamp !== 'number') {
            timestamp = parseInt(timestamp);
        }
        
        // Verificar se é NaN após conversão
        if (isNaN(timestamp)) {
            return "--:--:--";
        }
        
        // Se o timestamp for pequeno demais ou grande demais, é provavelmente inválido
        if (timestamp <= 0) {
            return "--:--:--";
        }
        
        // Verificar formato (segundos vs milissegundos)
        const timestampDate = new Date(timestamp);
        const timestampYear = timestampDate.getFullYear();
        
        // Se o ano for 1970 ou uma data inválida, provavelmente está em segundos
        if (timestampYear === 1970 || timestampYear < 2010 || timestampYear > 2050) {
            // Tentar multiplicar por 1000 para converter de segundos para ms
            timestamp = timestamp * 1000;
            const newDate = new Date(timestamp);
            
            // Se ainda estiver em 1970, está realmente inválido
            if (newDate.getFullYear() < 2010) {
                return "--:--:--";
            }
            
            return formatarHora(newDate);
        }
        
        return formatarHora(timestampDate);
    } catch (error) {
        return "--:--:--";
    }
}

// Função auxiliar para formatar apenas a hora
function formatarHora(data) {
    const horas = data.getHours().toString().padStart(2, '0');
    const minutos = data.getMinutes().toString().padStart(2, '0');
    const segundos = data.getSeconds().toString().padStart(2, '0');
    return `${horas}:${minutos}:${segundos}`;
}

// Função para determinar o status da loja
function determinarStatus(loja) {
    // Retornar diretamente o status recebido do Firebase, sem verificações
    if (loja.pc_status && loja.pc_status.status) {
        // Usa o status definido diretamente no Firebase
        if (loja.pc_status.status === "Online") {
            return { 
                status: "Online", 
                classe: "bg-success", 
                indicador: "status-online" 
            };
        } else {
            return { 
                status: "Offline", 
                classe: "bg-danger", 
                indicador: "status-offline" 
            };
        }
    }
    
    // Valor padrão se não houver status definido
    return { 
        status: "Indefinido", 
        classe: "bg-secondary", 
        indicador: "status-undefined" 
    };
}

// Função para contar dispositivos
function contarDispositivos(loja, tipo) {
    if (!loja || !loja[tipo]) return 0;
    
    // Para o caso de ar_condicionado, que pode ser um objeto simples
    if (tipo === 'ar_condicionado') {
        return Object.keys(loja[tipo]).length > 0 ? 1 : 0;
    }
    
    // Caso especial para secadoras (para não contar duplicados com diferentes tempos)
    if (tipo === 'secadoras') {
        // Obtém chaves das secadoras (que incluem ID_tempo, como "765_15", "765_30", etc)
        const keys = Object.keys(loja[tipo]);
        // Extrai apenas os IDs únicos (parte inicial antes do underscore)
        const uniqueIds = new Set();
        
        keys.forEach(key => {
            // Extrai o ID base da secadora (parte antes de "_")
            const baseId = key.split('_')[0];
            uniqueIds.add(baseId);
        });
        
        return uniqueIds.size; // Retorna a quantidade de IDs únicos
    }
    
    // Para outros tipos (lavadoras, dosadora_01)
    return Object.keys(loja[tipo]).length;
}

// Função para obter a região e estado de uma loja
function getLojaRegionAndState(codigo) {
    // Para códigos que incluem o estado diretamente (ex: PB05, SP01, RN02, etc.)
    const matchEstado = codigo.match(/^([A-Z]{2})/);
    
    if (matchEstado && matchEstado[1]) {
        const estado = matchEstado[1];
        
        // Encontrar a região com base no estado
        for (const [regiao, estados] of Object.entries(estadosPorRegiao)) {
            if (estados.includes(estado)) {
                return { regiao, estado };
            }
        }
    }
    
    // Verificar prefixos especiais para lojas que não seguem o padrão de estado
    if (codigo.startsWith('L')) {
        // Se começa com L, tenta extrair o estado dos próximos dois caracteres
        // Ex: LPB05-001, onde PB é o estado
        const matchPrefixEstado = codigo.match(/^L([A-Z]{2})/);
        if (matchPrefixEstado && matchPrefixEstado[1]) {
            const estado = matchPrefixEstado[1];
            
            // Encontrar a região com base no estado
            for (const [regiao, estados] of Object.entries(estadosPorRegiao)) {
                if (estados.includes(estado)) {
                    return { regiao, estado };
                }
            }
        }
    }
    
    // Análise de códigos numéricos ou outros padrões não identificados
    // Neste caso, verificamos qualquer sequência de 2 letras no código
    const generalMatch = codigo.match(/([A-Z]{2})/);
    if (generalMatch && generalMatch[1]) {
        const possibleEstado = generalMatch[1];
        
        // Verificar se essas letras correspondem a um estado válido
        for (const [regiao, estados] of Object.entries(estadosPorRegiao)) {
            if (estados.includes(possibleEstado)) {
                return { regiao, estado: possibleEstado };
            }
        }
    }
    
    // Padrão se não conseguir extrair estado
    return { regiao: 'indefinida', estado: 'indefinido' };
}

// Função para criar um card de loja
function criarCardLoja(codigo, loja) {
    // Clona o template
    const card = lojaCardTemplate.content.cloneNode(true);
    
    // Preenche os dados
    card.querySelector('.loja-codigo').textContent = codigo;
    
    // Status
    const statusInfo = determinarStatus(loja);
    const statusTexto = card.querySelector('.loja-status');
    
    // Última atualização
    const timestamp = loja.pc_status ? loja.pc_status.timestamp : null;
    const dataFormatada = formatarData(timestamp);
    card.querySelector('.loja-atualizacao').textContent = dataFormatada;
    
    // Atualiza o status baseado na verificação
    const cardElement = card.querySelector('.card');
    
    if (statusInfo.status === "Online") {
        statusTexto.textContent = "Online";
        statusTexto.className = "text-success fw-medium loja-status small-text";
        
        // Atualiza o indicador de status
        const statusIndicator = card.querySelector('.status-indicator');
        statusIndicator.classList.add('status-online');
    } else {
        statusTexto.textContent = "Offline";
        statusTexto.className = "text-danger fw-medium loja-status small-text";
        
        // Atualiza o indicador de status
        const statusIndicator = card.querySelector('.status-indicator');
        statusIndicator.classList.add('status-offline');
        
        // Adiciona classe para destacar card com status offline
        if (cardElement) {
            cardElement.classList.add('card-offline');
        }
    }
    
    // Status da Motherboard (agora Totem)
    const motherboardStatusText = card.querySelector('.motherboard-status');
    const motherboardIndicator = card.querySelector('.motherboard-indicator');
    
    // Se a loja estiver offline, exibir "indisponível" para o status do totem
    if (statusInfo.status === "Offline") {
        motherboardStatusText.textContent = "Totem: indisponível";
        motherboardStatusText.className = "text-muted fw-medium motherboard-status small-text";
    } else if (loja.status_motherboard) {
        const isMotherboardOn = loja.status_motherboard === 'ON';
        motherboardStatusText.textContent = `Totem: ${isMotherboardOn ? 'ON' : 'OFF'}`;
        motherboardStatusText.className = `${isMotherboardOn ? 'text-success' : 'text-danger'} fw-medium motherboard-status small-text`;
        
        // Adiciona classe para o indicador de status do totem
        if (isMotherboardOn) {
            motherboardIndicator.classList.add('status-online');
        } else {
            motherboardIndicator.classList.add('status-offline');
            
            // Adiciona classe para destacar card com totem offline (se ainda não tiver a classe card-offline)
            if (cardElement && !cardElement.classList.contains('card-offline')) {
                cardElement.classList.add('totem-offline');
            }
        }
    } else {
        motherboardStatusText.textContent = 'Totem: --';
        motherboardStatusText.className = 'text-muted fw-medium motherboard-status small-text';
    }
    
    // Extrair região e estado do código da loja
    const { regiao, estado } = getLojaRegionAndState(codigo);
    
    // Adiciona o código da loja como atributo data para facilitar atualizações
    if (cardElement) {
        cardElement.dataset.loja = codigo;
        cardElement.dataset.regiao = regiao;
        cardElement.dataset.estado = estado;
    }
    
    // Configura o botão de acesso
    const btnAcessar = card.querySelector('.btn-acessar');
    btnAcessar.href = `loja.html?id=${codigo}`;
    
    // Desabilitar botão se a loja estiver offline
    if (statusInfo.status === "Offline") {
        btnAcessar.classList.remove('btn-outline-primary');
        btnAcessar.classList.add('btn-outline-secondary');
        btnAcessar.disabled = true;
        btnAcessar.style.pointerEvents = "none"; // Impede completamente a interação
    }
    
    return card;
}

// Função para atualizar o status de uma loja existente no DOM
function atualizarStatusLoja(codigo, loja) {
    const cardElement = document.querySelector(`.card[data-loja="${codigo}"]`);
    if (!cardElement) return;
    
    // Atualiza o timestamp de última atualização
    const timestamp = loja.pc_status ? loja.pc_status.timestamp : null;
    const dataFormatada = formatarData(timestamp);
    const atualizacaoElement = cardElement.querySelector('.loja-atualizacao');
    if (atualizacaoElement) {
        atualizacaoElement.textContent = dataFormatada;
    }
    
    // Primeiro, remove todas as classes de destaque
    cardElement.classList.remove('card-offline', 'totem-offline');
    
    // Atualiza o status baseado na verificação
    const statusInfo = determinarStatus(loja);
    const statusTexto = cardElement.querySelector('.loja-status');
    
    // Status da loja
    if (statusTexto) {
        if (statusInfo.status === "Online") {
            statusTexto.textContent = "Online";
            statusTexto.className = "text-success fw-medium loja-status small-text";
            
            // Atualiza o indicador de status
            const statusIndicator = cardElement.querySelector('.status-indicator');
            statusIndicator.classList.remove('status-offline');
            statusIndicator.classList.add('status-online');
            
            // Atualiza o botão
            const btnAcessar = cardElement.querySelector('.btn-acessar');
            if (btnAcessar) {
                btnAcessar.classList.remove('btn-outline-secondary');
                btnAcessar.classList.remove('disabled');
                btnAcessar.classList.add('btn-outline-primary');
                btnAcessar.removeAttribute('disabled');
                btnAcessar.style.pointerEvents = "";
            }
        } else {
            statusTexto.textContent = "Offline";
            statusTexto.className = "text-danger fw-medium loja-status small-text";
            
            // Atualiza o indicador de status
            const statusIndicator = cardElement.querySelector('.status-indicator');
            statusIndicator.classList.remove('status-online');
            statusIndicator.classList.add('status-offline');
            
            // Adiciona classe para destacar card com status offline
            cardElement.classList.add('card-offline');
            
            // Atualiza o botão
            const btnAcessar = cardElement.querySelector('.btn-acessar');
            if (btnAcessar) {
                btnAcessar.classList.remove('btn-outline-primary');
                btnAcessar.classList.add('btn-outline-secondary');
                btnAcessar.classList.add('disabled');
                btnAcessar.setAttribute('disabled', 'disabled');
                btnAcessar.style.pointerEvents = "none";
            }
        }
    }
    
    // Status do totem
    const motherboardStatusText = cardElement.querySelector('.motherboard-status');
    const motherboardIndicator = cardElement.querySelector('.motherboard-indicator');
    
    if (motherboardStatusText && motherboardIndicator) {
        // Se a loja estiver offline, exibir "indisponível" para o status do totem
        if (statusInfo.status === "Offline") {
            motherboardStatusText.textContent = "Totem: indisponível";
            motherboardStatusText.className = "text-muted fw-medium motherboard-status small-text";
            motherboardIndicator.classList.remove('status-online', 'status-offline');
        } else if (loja.status_motherboard) {
            const isMotherboardOn = loja.status_motherboard === 'ON';
            motherboardStatusText.textContent = `Totem: ${isMotherboardOn ? 'ON' : 'OFF'}`;
            motherboardStatusText.className = `${isMotherboardOn ? 'text-success' : 'text-danger'} fw-medium motherboard-status small-text`;
            
            // Atualiza o indicador de status do totem
            motherboardIndicator.classList.remove('status-online', 'status-offline');
            if (isMotherboardOn) {
                motherboardIndicator.classList.add('status-online');
            } else {
                motherboardIndicator.classList.add('status-offline');
                
                // Adiciona classe para destacar card com totem offline (se ainda não tiver a classe card-offline)
                if (!cardElement.classList.contains('card-offline')) {
                    cardElement.classList.add('totem-offline');
                }
            }
        }
    }
}

// Função para criar uma nova linha de loja na tabela
function criarLinhaTabelaLoja(codigo, loja) {
    // Clone o template
    const template = document.getElementById('loja-row-template');
    if (!template) return null;
    
    const clone = document.importNode(template.content, true);
    const row = clone.querySelector('tr');
    
    // Adiciona o atributo data-loja com o código da loja
    row.setAttribute('data-loja', codigo);
    
    // Preenche os campos da linha
    row.querySelector('.loja-codigo').textContent = codigo;
    
    // Pegar a região e o estado da loja e preencher os campos
    let regiao = '';
    let estado = '';
    
    if (loja.regiao) {
        regiao = loja.regiao;
    } else if (loja.regiao_formatada) {
        regiao = loja.regiao_formatada;
    }
    
    if (loja.uf) {
        estado = loja.uf;
    } else if (loja.estado) {
        estado = loja.estado;
    }
    
    // Se ainda estiver em branco, extrair a região e estado do código da loja
    if (!regiao || !estado || regiao === '--' || estado === '--') {
        const infoLoja = getLojaRegionAndState(codigo);
        
        if (!regiao || regiao === '--') {
            // Formatar a região com primeira letra maiúscula para melhor apresentação
            if (infoLoja.regiao && infoLoja.regiao !== 'indefinida') {
                regiao = infoLoja.regiao.charAt(0).toUpperCase() + infoLoja.regiao.slice(1);
            }
        }
        
        if (!estado || estado === '--') {
            if (infoLoja.estado && infoLoja.estado !== 'indefinido') {
                estado = infoLoja.estado.toUpperCase();
            }
        }
    }
    
    // Aplicar textos formatados aos elementos da tabela
    const regiaoElement = row.querySelector('.loja-regiao');
    const estadoElement = row.querySelector('.loja-estado');
    
    regiaoElement.textContent = regiao || 'Indefinida';
    estadoElement.textContent = estado || 'Indefinido';
    
    // Adicionar tooltip com nome completo do estado
    if (estado && estado.length === 2) {
        const nomeCompletoEstado = formatarNomeEstado(estado);
        if (nomeCompletoEstado !== estado) {
            estadoElement.setAttribute('title', nomeCompletoEstado);
            estadoElement.classList.add('text-decoration-underline', 'cursor-help');
        }
    }
    
    // Obtem o status
    const statusInfo = determinarStatus(loja);
    
    // Aplica o status visualmente
        const statusIndicator = row.querySelector('.status-indicator');
    const lojaStatus = row.querySelector('.loja-status');
        
    if (statusIndicator) {
        statusIndicator.classList.add(statusInfo.indicador);
        }
    
    if (lojaStatus) {
        lojaStatus.textContent = statusInfo.status;
        lojaStatus.classList.add(statusInfo.classe === 'bg-success' ? 'text-success' : 'text-danger');
    }
    
    // Atualiza a última atualização
    const timestamp = loja.heartbeat || (loja.pc_status ? loja.pc_status.timestamp : null);
    const atualizacaoElement = row.querySelector('.loja-atualizacao');
    
    if (atualizacaoElement && timestamp) {
        atualizacaoElement.textContent = formatarHora(new Date(parseInt(timestamp)));
    } else if (atualizacaoElement) {
        atualizacaoElement.textContent = "--:--:--";
    }
    
    // Configura o botão de acesso
    const btnAcessar = row.querySelector('.btn-acessar');
    if (btnAcessar) {
    btnAcessar.href = `loja.html?id=${codigo}`;
    
        // Configura o estado do botão baseado no status
        if (statusInfo.status === 'Online') {
            btnAcessar.classList.remove('btn-outline-secondary', 'disabled');
            btnAcessar.classList.add('btn-outline-primary');
            btnAcessar.removeAttribute('disabled');
            btnAcessar.removeAttribute('tabindex');
            btnAcessar.removeAttribute('aria-disabled');
            btnAcessar.style.pointerEvents = "";
        } else {
            btnAcessar.classList.remove('btn-outline-primary');
            btnAcessar.classList.add('btn-outline-secondary', 'disabled');
            btnAcessar.setAttribute('disabled', 'disabled');
            btnAcessar.setAttribute('tabindex', '-1');
            btnAcessar.setAttribute('aria-disabled', 'true');
            btnAcessar.style.pointerEvents = "none";
        }
    }
    
    const equipamentosCell = row.querySelector('.loja-equipamentos');
    if (equipamentosCell) {
        equipamentosCell.innerHTML = '<span class="text-muted small">...</span>';
        if (typeof firebase === 'undefined' || !firebase.apps.length) {
            equipamentosCell.innerHTML = '<span class="text-danger small">Erro Firebase</span>';
            equipamentosCell.setAttribute('data-offline', 0);
            return;
        }
        firebase.database().ref(`/${codigo}/status`).once('value').then(snapshot => {
            const status = snapshot.val() || {};
            const tipos = ['lavadoras', 'secadoras', 'dosadoras', 'ar_condicionado'];
            let totalOffline = 0;
            let algumEquipamento = false;
            let bolinhas = '';
            tipos.forEach(tipo => {
                if (status[tipo]) {
                    algumEquipamento = true;
                    if (typeof status[tipo] === 'object') {
                        bolinhas += Object.entries(status[tipo]).map(([id, st]) => {
                            if(st !== 'online') totalOffline++;
                            return `<span title='${tipo} ${id}' style='display:inline-block;width:10px;height:10px;border-radius:50%;margin:0 1px;vertical-align:middle;${st==="online"?"background:#28a745;":"background:#dc3545;"}'></span>`;
                        }).join('');
                    } else {
                        if(status[tipo] !== 'online') totalOffline++;
                        bolinhas += `<span title='${tipo}' style='display:inline-block;width:10px;height:10px;border-radius:50%;margin:0 1px;vertical-align:middle;${status[tipo]==="online"?"background:#28a745;":"background:#dc3545;"}'></span>`;
                    }
                }
            });
            equipamentosCell.innerHTML = algumEquipamento ? bolinhas : '<span class="text-muted small">Nenhum</span>';
            equipamentosCell.setAttribute('data-offline', totalOffline);
        }).catch(() => {
            equipamentosCell.innerHTML = '<span class="text-danger small">Erro</span>';
            equipamentosCell.setAttribute('data-offline', 0);
        });
    }
    
    return row;
}

// Função para atualizar o status de uma linha de loja existente no DOM
function atualizarStatusLinhaLoja(codigo, loja) {
    const rowElement = document.querySelector(`#lojas-table-body tr[data-loja="${codigo}"]`);
    if (!rowElement) return;
    
    // Atualiza o status
    const statusInfo = determinarStatus(loja);
    const statusTexto = rowElement.querySelector('.loja-status');
    const btnAcessar = rowElement.querySelector('.btn-acessar');
    
    // Atualiza a última atualização
    const timestamp = loja.pc_status ? loja.pc_status.timestamp : null;
    const atualizacaoElement = rowElement.querySelector('.loja-atualizacao');
    if (atualizacaoElement && timestamp) {
        atualizacaoElement.textContent = formatarHora(new Date(parseInt(timestamp)));
    } else if (atualizacaoElement) {
        atualizacaoElement.textContent = "--:--:--";
    }
    
    // Primeiro, remove todas as classes de destaque
    rowElement.classList.remove('table-danger', 'table-success', 'table-warning');
    
    // Atualiza o texto e a classe do status
    if (statusTexto) {
        statusTexto.textContent = statusInfo.status;
        statusTexto.className = `loja-status badge ${statusInfo.classe}`;
    }
    
    // Atualiza o botão de acesso baseado no status
            if (btnAcessar) {
        if (statusInfo.status === "Online") {
            btnAcessar.classList.remove('disabled');
            btnAcessar.classList.remove('btn-secondary');
            btnAcessar.classList.add('btn-primary');
        } else {
            btnAcessar.classList.add('disabled');
            btnAcessar.classList.add('btn-secondary');
            btnAcessar.classList.remove('btn-primary');
        }
    }
    
    // Adiciona a classe de destaque apropriada
    if (statusInfo.status === "Online") {
        rowElement.classList.add('table-success');
    } else if (statusInfo.status === "Offline") {
        rowElement.classList.add('table-danger');
    }
}

// Função para filtrar lojas com base na pesquisa, região e estado
function filtrarLojas() {
    // Para medir o desempenho
    
    // Obter os valores dos filtros com verificação de nulo
    const termoPesquisa = searchInput?.value?.toLowerCase().trim() || '';
    const regiaoSelecionada = regionFilter?.value || '';
    const estadoSelecionado = stateFilter?.value || '';
    const statusSelecionado = statusFilter?.value || '';
    
    // Salvar o estado atual dos filtros
    salvarFiltros();
    
    // Mostrar indicador de carregamento durante a filtragem
    if (lojasTableBody) {
        lojasTableBody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-2">
                    <div class="spinner-border spinner-border-sm text-primary me-2" role="status">
                        <span class="visually-hidden">Filtrando...</span>
                    </div>
                    Aplicando filtros...
                </td>
            </tr>
        `;
    }
    
    setTimeout(() => {
        try {
            lojasFiltradas = todasLojas.filter(loja => {
                let passaFiltroTexto = true;
                let passaFiltroRegiao = true;
                let passaFiltroEstado = true;
                let passaFiltroStatus = true;
                
                // Filtro de texto
                if (termoPesquisa) {
                    passaFiltroTexto = loja.codigo.toLowerCase().includes(termoPesquisa);
                }
                
                // Filtro de região
                if (regiaoSelecionada) {
                    const regiaoLoja = loja.dados.regiao || loja.dados.regiao_formatada || '';
                    passaFiltroRegiao = regiaoLoja.toLowerCase() === regiaoSelecionada.toLowerCase();
                }
                
                // Filtro de estado
                if (estadoSelecionado) {
                    const estadoLoja = loja.dados.uf || loja.dados.estado || '';
                    passaFiltroEstado = estadoLoja.toLowerCase() === estadoSelecionado.toLowerCase();
                }
                
                // Filtro de status
                if (statusSelecionado) {
                    const statusInfo = determinarStatus(loja.dados);
                    passaFiltroStatus = (statusSelecionado === 'online' && statusInfo.status === 'Online') || 
                                        (statusSelecionado === 'offline' && statusInfo.status === 'Offline');
                }
                
                // Retorna true apenas se passar por todos os filtros
                return passaFiltroTexto && passaFiltroRegiao && passaFiltroEstado && passaFiltroStatus;
            });
            
            // Limitar o número de resultados para não sobrecarregar o navegador
            const resultadosMaximos = 100;
            const resultadosLimitados = lojasFiltradas.length > resultadosMaximos;
            
            if (resultadosLimitados) {
                lojasFiltradas = lojasFiltradas.slice(0, resultadosMaximos);
            }
            
            // Atualizar contador de lojas com verificação de nulo
            if (storeCountElement) {
                storeCountElement.textContent = `${lojasFiltradas.length} lojas encontradas${resultadosLimitados ? ' (mostrando primeiras 100)' : ''}`;
            }
            
            // Se já existe uma instância do DataTable, destrua-a
            if (lojasTable) {
                lojasTable.clear().destroy();
            }
            
            // Verificar se o elemento da tabela existe
            if (!lojasTableBody) {
                return;
            }
            
            // Limpar a tabela
    lojasTableBody.innerHTML = '';
    
    // Se não encontrou nenhuma loja, mostrar mensagem
    if (lojasFiltradas.length === 0) {
        // Mensagem para visualização em tabela
        lojasTableBody.innerHTML = `
            <tr>
                        <td colspan="6" class="text-center py-4">
                    <div class="alert alert-info mb-0">
                        <i class="fas fa-info-circle me-2"></i>
                                Nenhuma loja encontrada com os filtros aplicados.
                    </div>
                </td>
            </tr>
        `;
            } else {
                // Criar um fragmento para melhor performance
            const fragmento = document.createDocumentFragment();
            
                // Adicionar cada loja filtrada à visualização em tabela
    lojasFiltradas.forEach(loja => {
        // Adicionar à visualização em tabela
                    const row = criarLinhaTabelaLoja(loja.codigo, loja.dados);
                    if (row) {
                        fragmento.appendChild(row);
                    }
            });
            
                // Adicionar todas as linhas de uma vez para melhor performance
            lojasTableBody.appendChild(fragmento);
            
                // Inicializar DataTable após populá-la
                try {
                    lojasTable = $('#lojas-table').DataTable({
                        pageLength: 25,
                        lengthMenu: [10, 25, 50, 100],
                        language: {
                            sEmptyTable: "Nenhum registro encontrado",
                            sInfo: "Mostrando de _START_ até _END_ de _TOTAL_ registros",
                            sInfoEmpty: "Mostrando 0 até 0 de 0 registros",
                            sInfoFiltered: "(Filtrados de _MAX_ registros)",
                            sInfoPostFix: "",
                            sInfoThousands: ".",
                            sLengthMenu: "_MENU_ resultados por página",
                            sLoadingRecords: "Carregando...",
                            sProcessing: "Processando...",
                            sZeroRecords: "Nenhum registro encontrado",
                            sSearch: "Pesquisar",
                            oPaginate: {
                                sNext: "Próximo",
                                sPrevious: "Anterior",
                                sFirst: "Primeiro",
                                sLast: "Último"
                            },
                            oAria: {
                                sSortAscending: ": Ordenar colunas de forma ascendente",
                                sSortDescending: ": Ordenar colunas de forma descendente"
                            }
                        },
                        order: [[0, 'asc']],
                        columnDefs: [
                            { 
                                orderable: false, 
                                targets: 5,
                                className: 'text-center',
                                width: '120px'
                            }
                        ],
                        responsive: true,
                        deferRender: true,
                        processing: true,
                        scrollX: false,
                        autoWidth: false
                    });
                } catch (error) {
                    console.error('Erro ao inicializar DataTable:', error);
                }
            }
        } catch (error) {
            console.error("Erro ao filtrar lojas:", error);
            if (lojasTableBody) {
                lojasTableBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="text-center py-4">
                            <div class="alert alert-danger">
                                <i class="fas fa-exclamation-circle me-2"></i>
                                Erro ao filtrar lojas: ${error.message}
                            </div>
                        </td>
                    </tr>
                `;
            }
        }
    }, 0);
}

// Função para preencher o select de estados com base na região selecionada
function preencherSelectEstados(selectElement, regiao) {
    // Limpar select de estados
    selectElement.innerHTML = '<option value="">Todos os Estados</option>';
    
    // Se não tiver região selecionada, mostrar todos os estados
    if (!regiao) {
        const todosEstados = Object.keys(estadosNomes).sort();
        todosEstados.forEach(estado => {
            const option = document.createElement('option');
            option.value = estado;
            option.textContent = `${estado} - ${estadosNomes[estado]}`;
            selectElement.appendChild(option);
        });
        return;
    }
    
    // Pegar estados da região selecionada
    const estados = estadosPorRegiao[regiao] || [];
    
    // Adicionar opções de estados
    estados.forEach(estado => {
        const option = document.createElement('option');
        option.value = estado;
        option.textContent = `${estado} - ${estadosNomes[estado]}`;
        selectElement.appendChild(option);
    });
}

// Função para atualizar o contador de lojas afetadas no modal de reset
function atualizarContadorLojasAfetadas() {
    // Verificar se os elementos necessários existem
    if (!resetScopeFiltered || !resetScopeRegion || !resetScopeState) {
        console.warn("Elementos de escopo de reset não encontrados no DOM.");
        return [];
    }

    let lojasAfetadas = [];
    
    // Verificar o escopo selecionado
    if (resetScopeFiltered.checked) {
        // Usar as lojas filtradas atuais
        lojasAfetadas = lojasFiltradas;
    } else if (resetScopeRegion.checked) {
        // Filtrar por região
        const regiao = resetRegion?.value || '';
        lojasAfetadas = todasLojas.filter(loja => {
            const { regiao: lojaRegiao } = getLojaRegionAndState(loja.codigo);
            return lojaRegiao === regiao;
        });
    } else if (resetScopeState.checked) {
        // Filtrar por estado
        const estado = resetState?.value || '';
        lojasAfetadas = todasLojas.filter(loja => {
            const { estado: lojaEstado } = getLojaRegionAndState(loja.codigo);
            return lojaEstado === estado;
        });
    }
    
    // Atualizar o contador
    affectedStoresCount.textContent = `${lojasAfetadas.length} lojas`;
    
    return lojasAfetadas;
}

// Função para executar o reset em lote
async function executarResetEmLote() {
    const lojasAfetadas = atualizarContadorLojasAfetadas();
    const tipoReset = resetType.value;
    
    if (lojasAfetadas.length === 0) {
        Swal.fire({
            icon: 'info',
            title: 'Nenhuma loja selecionada',
            text: 'Selecione pelo menos uma loja para realizar o reset.',
            confirmButtonColor: '#0d6efd'
        });
        return;
    }
    
    // Confirmar a operação com SweetAlert2
    const resultado = await Swal.fire({
        icon: 'warning',
        title: tipoReset === 'restart' ? 'Reiniciar Lojas' : 'Desligar Lojas',
        html: tipoReset === 'restart' 
            ? `<div class="text-start">
                 <p>Tem certeza que deseja <strong>reiniciar ${lojasAfetadas.length} lojas</strong>?</p>
                 <p class="mt-3 mb-0">O processo consiste em:</p>
                 <ol class="mt-2">
                   <li>Desligar (2)</li>
                   <li>Aguardar retorno para (0)</li>
                   <li>Esperar 20s</li>
                   <li>Ligar (1)</li>
                 </ol>
               </div>`
            : `<p>Tem certeza que deseja <strong>desligar ${lojasAfetadas.length} lojas</strong>?</p>`,
        showCancelButton: true,
        confirmButtonText: tipoReset === 'restart' ? 'Sim, reiniciar' : 'Sim, desligar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: tipoReset === 'restart' ? '#0d6efd' : '#dc3545',
        cancelButtonColor: '#6c757d',
        reverseButtons: true
    });
    
    if (!resultado.isConfirmed) {
        return;
    }
    
    // Preparar dados para registro no Firestore
    const codigosLojas = lojasAfetadas.map(loja => loja.codigo);
    let escopo = '';
    
    if (resetScopeFiltered.checked) {
        escopo = 'filtradas';
    } else if (resetScopeRegion.checked) {
        escopo = `região: ${resetRegion.value}`;
    } else if (resetScopeState.checked) {
        escopo = `estado: ${resetState.value}`;
    }
    
    // Registrar a operação no Firestore
    try {
        const configuracao = {
            escopo: escopo,
            tipoReset: tipoReset,
            quantidadeLojas: lojasAfetadas.length,
            lojasAfetadas: codigosLojas
        };
        await registrarResetEmLote(configuracao);
        console.log('Operação de reset em lote registrada no Firestore');
    } catch (error) {
        console.error('Erro ao registrar reset em lote no Firestore:', error);
    }
    
    // Mostrar loading com SweetAlert2
    const loadingSwal = Swal.fire({
        title: tipoReset === 'restart' ? 'Reiniciando lojas...' : 'Desligando lojas...',
        html: `<div class="text-center">
                <p class="mb-3">Processando <strong>0%</strong> concluído</p>
                <div class="progress">
                  <div class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" style="width: 0%" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"></div>
                </div>
                <p class="mt-3 small text-muted">Aguarde enquanto processamos sua solicitação</p>
              </div>`,
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });
    
    // Desabilitar o botão no modal original também
    confirmBatchResetBtn.disabled = true;
    
    // Contador de operações concluídas
    let operacoesConcluidas = 0;
    let sucessos = 0;
    let falhas = 0;
    
    // Processar cada loja
    const promessas = lojasAfetadas.map(async (loja) => {
        try {
            // Construir caminho para o comando reset no Firebase
            const resetPath = `/${loja.codigo}/reset`;
            
            if (tipoReset === 'restart') {
                // 1. Enviar comando para desligar (2)
                await database.ref(resetPath).set(2);
                console.log(`Comando de desligamento (2) enviado para loja ${loja.codigo}`);
                
                // Atualizar indicador de progresso específico para esta loja
                const porcentagemEtapa = Math.round((operacoesConcluidas / lojasAfetadas.length) * 100) + 
                    (1 / (lojasAfetadas.length * 4)) * 100;
                atualizarProgressoSweetAlert(porcentagemEtapa);
                
                // 2. Aguardar até que o valor volte para 0
                console.log(`Aguardando retorno para valor 0 após comando de desligamento para loja ${loja.codigo}`);
                
                await new Promise((resolve, reject) => {
                    // Definir um timeout para o caso de não receber resposta
                    const timeoutId = setTimeout(() => {
                        database.ref(resetPath).off('value', onValueChange);
                        reject(new Error("Timeout ao aguardar retorno para 0 após comando de desligamento"));
                    }, 60000); // 60 segundos de timeout
                    
                    // Listener para aguardar o retorno a 0
                    const onValueChange = database.ref(resetPath).on('value', (snapshot) => {
                        const valor = snapshot.val();
                        console.log(`Loja ${loja.codigo} - Valor atual do reset após comando 2: ${valor}`);
                        
                        if (valor === 0) {
                            clearTimeout(timeoutId);
                            database.ref(resetPath).off('value', onValueChange);
                            console.log(`Loja ${loja.codigo} - Reset retornou para 0 após comando de desligamento`);
                            resolve();
                        }
                    });
                });
                
                // Atualizar progresso após receber retorno 0
                const porcentagemEtapa2 = Math.round((operacoesConcluidas / lojasAfetadas.length) * 100) + 
                    (2 / (lojasAfetadas.length * 4)) * 100;
                atualizarProgressoSweetAlert(porcentagemEtapa2);
                
                // 3. Aguardar 20 segundos após o valor ter retornado para 0
                console.log(`Iniciando espera de 20 segundos para loja ${loja.codigo}`);
                await new Promise(resolve => setTimeout(resolve, 20000));
                console.log(`Espera de 20 segundos concluída para loja ${loja.codigo}`);
                
                // Atualizar progresso após espera de 20s
                const porcentagemEtapa3 = Math.round((operacoesConcluidas / lojasAfetadas.length) * 100) + 
                    (3 / (lojasAfetadas.length * 4)) * 100;
                atualizarProgressoSweetAlert(porcentagemEtapa3);
                
                // 4. Enviar comando para ligar (1)
                await database.ref(resetPath).set(1);
                console.log(`Comando de ligação (1) enviado para loja ${loja.codigo}`);
                
                // 5. Aguardar a confirmação final (valor 0 novamente)
                console.log(`Aguardando confirmação final (0) para loja ${loja.codigo}`);
                
                await new Promise((resolve, reject) => {
                    // Definir um timeout para o caso de não receber resposta
                    const timeoutId = setTimeout(() => {
                        database.ref(resetPath).off('value', onValueChange);
                        reject(new Error("Timeout ao aguardar confirmação final"));
                    }, 60000); // 60 segundos de timeout
                    
                    // Listener para aguardar o retorno a 0
                    const onValueChange = database.ref(resetPath).on('value', (snapshot) => {
                        const valor = snapshot.val();
                        console.log(`Loja ${loja.codigo} - Valor atual do reset após comando 1: ${valor}`);
                        
                        if (valor === 0) {
                            clearTimeout(timeoutId);
                            database.ref(resetPath).off('value', onValueChange);
                            console.log(`Loja ${loja.codigo} - Reset concluído com sucesso (retornou para 0)`);
                            resolve();
                        }
                    });
                });
                
                sucessos++;
                console.log(`Reinicialização completa confirmada para loja ${loja.codigo}`);
            } else {
                // Apenas desligar (2)
                await database.ref(resetPath).set(2);
                sucessos++;
                console.log(`Comando de desligamento enviado para loja ${loja.codigo}`);
            }
        } catch (error) {
            falhas++;
            console.error(`Erro ao processar reset para loja ${loja.codigo}:`, error);
            
            // Garantir que não há listeners pendentes
            try {
                database.ref(`/${loja.codigo}/reset`).off();
            } catch (e) {
                console.error(`Erro ao remover listeners para loja ${loja.codigo}:`, e);
            }
        } finally {
            operacoesConcluidas++;
            
            // Atualizar texto do botão e barra de progresso
            const porcentagem = Math.round((operacoesConcluidas / lojasAfetadas.length) * 100);
            confirmBatchResetBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Processando... ${porcentagem}%`;
            
            atualizarProgressoSweetAlert(porcentagem);
        }
    });
    
    // Função para atualizar o progresso no SweetAlert2
    function atualizarProgressoSweetAlert(porcentagem) {
        const progressBar = Swal.getHtmlContainer().querySelector('.progress-bar');
        const progressText = Swal.getHtmlContainer().querySelector('p strong');
        if (progressBar && progressText) {
            progressBar.style.width = `${porcentagem}%`;
            progressBar.setAttribute('aria-valuenow', porcentagem);
            progressText.textContent = `${porcentagem}%`;
            
            // Atualizar o título com o progresso também
            Swal.getTitle().textContent = `${tipoReset === 'restart' ? 'Reiniciando' : 'Desligando'} lojas... (${porcentagem}%)`;
        }
    }
    
    // Aguardar todas as operações terminarem
    try {
        await Promise.all(promessas);
    } catch (error) {
        console.error("Erro durante o processamento em lote:", error);
    }
    
    // Fechar o loading SweetAlert
    Swal.close();
    
    // Restaurar botão
    confirmBatchResetBtn.disabled = false;
    confirmBatchResetBtn.innerHTML = '<i class="fas fa-power-off me-2"></i>Executar Reset';
    
    // Mostrar resultado com SweetAlert2
    Swal.fire({
        icon: sucessos > 0 ? (falhas === 0 ? 'success' : 'warning') : 'error',
        title: 'Operação concluída',
        html: `<div class="text-start">
                <p class="mb-3">Resumo da operação:</p>
                <ul class="list-unstyled">
                  <li><i class="fas fa-check-circle text-success me-2"></i> <strong>${sucessos}</strong> ${sucessos === 1 ? 'loja processada' : 'lojas processadas'} com sucesso</li>
                  ${falhas > 0 ? `<li class="mt-2"><i class="fas fa-times-circle text-danger me-2"></i> <strong>${falhas}</strong> ${falhas === 1 ? 'falha' : 'falhas'} durante o processo</li>` : ''}
                </ul>
              </div>`,
        confirmButtonText: 'OK',
        confirmButtonColor: '#0d6efd'
    });
    
    // Fechar modal
    const batchResetModal = bootstrap.Modal.getInstance(document.getElementById('batchResetModal'));
    batchResetModal.hide();
}

// Função para atualizar as estatísticas de lojas e totems
function atualizarEstatisticas() {
    // Filtrar nós especiais como 'status_history' antes de contar
    const lojasValidas = todasLojas.filter(loja =>
        loja.codigo !== 'status_history' &&
        loja.codigo !== 'metadata' &&
        loja.dados && loja.dados.pc_status // só conta se tem dados e status
    );
    let totalLojas = lojasValidas.length;
    
    let lojasOnline = 0;
    let lojasOffline = 0;
    let totemsOn = 0;
    let totemsOff = 0;
    let totalTotemsMonitorados = 0;
    
    // Arrays para armazenar lojas com problemas
    let lojasComProblema = [];
    let totemsDesligados = [];
    
    // Conta lojas online/offline e totems on/off
    lojasValidas.forEach(loja => {
        // Verifica status da loja diretamente do Firebase
        if (loja.dados && loja.dados.pc_status && loja.dados.pc_status.status === "Online") {
            lojasOnline++;
        } else if (loja.dados && loja.dados.pc_status && loja.dados.pc_status.status === "Offline") {
            lojasOffline++;
            lojasComProblema.push({
                codigo: loja.codigo,
                ultimaAtualizacao: loja.dados.pc_status ? loja.dados.pc_status.timestamp : null,
                regiao: getLojaRegionAndState(loja.codigo).regiao,
                estado: getLojaRegionAndState(loja.codigo).estado
            });
        }
        // Não conta 'Indefinido' nem outros valores como offline
    });
    
    // Verifica status do totem diretamente, sem inferências baseadas em tempo
    lojasValidas.forEach(loja => {
        if (loja.dados.status_motherboard) {
            totalTotemsMonitorados++;
            if (loja.dados.status_motherboard === 'ON') {
                totemsOn++;
            } else {
                totemsOff++;
                // Apenas adiciona à lista de totems desligados se a loja estiver online
                if (loja.dados.pc_status && loja.dados.pc_status.status === "Online") {
                    totemsDesligados.push({
                        codigo: loja.codigo,
                        ultimaAtualizacao: loja.dados.pc_status ? loja.dados.pc_status.timestamp : null,
                        regiao: getLojaRegionAndState(loja.codigo).regiao,
                        estado: getLojaRegionAndState(loja.codigo).estado
                    });
                }
            }
        }
    });
    
    // Calcula porcentagens
    const percentLojasOnline = totalLojas > 0 ? Math.round((lojasOnline / totalLojas) * 100) : 0;
    const percentLojasOffline = totalLojas > 0 ? Math.round((lojasOffline / totalLojas) * 100) : 0;
    
    const percentTotemsOn = totalTotemsMonitorados > 0 ? Math.round((totemsOn / totalTotemsMonitorados) * 100) : 0;
    const percentTotemsOff = totalTotemsMonitorados > 0 ? Math.round((totemsOff / totalTotemsMonitorados) * 100) : 0;
    
    // Atualiza contadores de lojas
    if (lojasOnlineCount) lojasOnlineCount.textContent = lojasOnline;
    if (lojasOnlinePercent) lojasOnlinePercent.textContent = `${percentLojasOnline}%`;
    if (lojasOfflineCount) lojasOfflineCount.textContent = lojasOffline;
    if (lojasOfflinePercent) lojasOfflinePercent.textContent = `${percentLojasOffline}%`;
    
    // Atualiza o contador total
    const totalLojasElement = document.getElementById('total-lojas');
    if (totalLojasElement) totalLojasElement.textContent = totalLojas;
    
    // Atualiza barras de progresso das lojas
    if (lojasOnlineProgress) {
        lojasOnlineProgress.style.width = `${percentLojasOnline}%`;
        lojasOnlineProgress.setAttribute('aria-valuenow', percentLojasOnline);
    }
    
    // Atualiza a barra de progresso offline
    const lojasOfflineProgress = document.getElementById('lojas-offline-progress');
    if (lojasOfflineProgress) {
        lojasOfflineProgress.style.width = `${percentLojasOffline}%`;
        lojasOfflineProgress.setAttribute('aria-valuenow', percentLojasOffline);
    }
    
    // Atualiza contadores de totems
    if (totemsOnlineCount) totemsOnlineCount.textContent = totemsOn;
    if (totemsOnlinePercent) totemsOnlinePercent.textContent = `${percentTotemsOn}%`;
    if (totemsOfflineCount) totemsOfflineCount.textContent = totemsOff;
    if (totemsOfflinePercent) totemsOfflinePercent.textContent = `${percentTotemsOff}%`;
    
    // Atualiza barra de progresso dos totems
    if (totemsOnlineProgress) {
        totemsOnlineProgress.style.width = `${percentTotemsOn}%`;
        totemsOnlineProgress.setAttribute('aria-valuenow', percentTotemsOn);
    }
    
    // Atualiza listas de lojas com problemas
    if (lojasOfflineBadge && lojasOfflineList) {
        // Obter valores dos filtros
        const regiaoFiltro = lojasOfflineRegiao ? lojasOfflineRegiao.value : '';
        const estadoFiltro = lojasOfflineEstado ? lojasOfflineEstado.value : '';
        
        // Filtrar lojas offline com base na região e estado
        let lojasComProblemaFiltradas = lojasComProblema;
        
        if (regiaoFiltro) {
            lojasComProblemaFiltradas = lojasComProblemaFiltradas.filter(loja => loja.regiao === regiaoFiltro);
        }
        
        if (estadoFiltro) {
            lojasComProblemaFiltradas = lojasComProblemaFiltradas.filter(loja => loja.estado === estadoFiltro);
        }
        
        // Atualiza o badge com o número de lojas offline (total sem filtro)
        lojasOfflineBadge.textContent = lojasComProblema.length;
        
        // Limpa a lista atual
        while (lojasOfflineList.firstChild) {
            if (lojasOfflineList.firstChild.id === 'no-lojas-offline') {
                break;
            }
            lojasOfflineList.removeChild(lojasOfflineList.firstChild);
        }
        
        // Mostra mensagem se não houver lojas offline após filtro
        if (lojasComProblemaFiltradas.length === 0) {
            if (noLojasOffline) {
                // Mensagem personalizada se há lojas offline mas foram filtradas
                if (lojasComProblema.length > 0) {
                    noLojasOffline.innerHTML = `
                        <i class="fas fa-filter me-2"></i>Nenhuma loja offline corresponde aos filtros
                    `;
                } else {
                    noLojasOffline.innerHTML = `
                        <i class="fas fa-check-circle me-2"></i>Todas as lojas estão online
                    `;
                }
                noLojasOffline.style.display = 'block';
            }
        } else {
            if (noLojasOffline) {
                noLojasOffline.style.display = 'none';
            }
            
            // Ordena as lojas offline pela última atualização (mais recente primeiro)
            lojasComProblemaFiltradas.sort((a, b) => {
                if (!a.ultimaAtualizacao) return 1;
                if (!b.ultimaAtualizacao) return -1;
                return b.ultimaAtualizacao - a.ultimaAtualizacao;
            });
            
            // Adiciona cada loja offline à lista
            lojasComProblemaFiltradas.forEach(loja => {
                const li = document.createElement('a');
                li.href = `loja.html?id=${loja.codigo}`;
                
                // Buscar os dados completos da loja
                const lojaCompleta = todasLojas.find(l => l.codigo === loja.codigo);
                if (!lojaCompleta) return;
                
                // Calcular o tempo offline
                let tempoOffline = 'Desconhecido';
                if (loja.ultimaAtualizacao) {
                    const agora = Date.now();
                    let ultimaAtualizacaoMs = loja.ultimaAtualizacao;
                    
                    // Verificar e ajustar o formato de timestamp (segundos vs milissegundos)
                    if (ultimaAtualizacaoMs < 10000000000) {
                        ultimaAtualizacaoMs *= 1000; // Converter de segundos para milissegundos
                    }
                    
                    const diffMs = agora - ultimaAtualizacaoMs;
                    
                    // Converter para minutos/horas
                    const diffMinutos = Math.floor(diffMs / (1000 * 60));
                    if (diffMinutos < 60) {
                        tempoOffline = `${diffMinutos} min`;
                    } else {
                        const diffHoras = Math.floor(diffMinutos / 60);
                        if (diffHoras < 24) {
                            const minutosRestantes = diffMinutos % 60;
                            tempoOffline = `${diffHoras}h ${minutosRestantes}min`;
                        } else {
                            const diffDias = Math.floor(diffHoras / 24);
                            tempoOffline = `${diffDias} ${diffDias === 1 ? 'dia' : 'dias'}`;
                        }
                    }
                }
                
                // Formata a data da última atualização
                let ultimaAtualizacao = 'Desconhecida';
                if (loja.ultimaAtualizacao) {
                    ultimaAtualizacao = formatarData(loja.ultimaAtualizacao);
                }
                
                // Contar dispositivos
                const qtdLavadoras = contarDispositivos(lojaCompleta.dados, 'lavadoras');
                const qtdSecadoras = contarDispositivos(lojaCompleta.dados, 'secadoras');
                const totalDispositivos = qtdLavadoras + qtdSecadoras;
                
                // Verificar último status conhecido do totem
                let totemStatusHTML = '';
                if (lojaCompleta.dados.status_motherboard) {
                    const totemStatus = lojaCompleta.dados.status_motherboard;
                    const isTotemOn = totemStatus === 'ON';
                    const statusColor = isTotemOn ? 'success' : 'warning';
                    const statusText = isTotemOn ? 'ON' : 'OFF';
                    const statusIcon = isTotemOn ? 'check-circle' : 'power-off';
                    
                    totemStatusHTML = `
                        <div class="mt-1 px-2 py-1 bg-light rounded-1 border border-secondary border-opacity-25">
                            <small class="text-muted">
                                <i class="fas fa-info-circle me-1"></i>
                                Último status conhecido do totem: 
                                <span class="text-${statusColor} fw-bold">
                                    <i class="fas fa-${statusIcon} me-1"></i>${statusText}
                                </span>
                                <i class="fas fa-question-circle ms-1 text-secondary" 
                                   data-bs-toggle="tooltip" 
                                   title="Este é o último status do totem antes da loja ficar offline. O status atual pode ser diferente."></i>
                            </small>
                        </div>
                    `;
                } else {
                    totemStatusHTML = `
                        <div class="mt-1 px-2 py-1 bg-light rounded-1 border border-secondary border-opacity-25">
                            <small class="text-muted">
                                <i class="fas fa-info-circle me-1"></i>
                                Status do totem: <span class="text-secondary">Desconhecido</span>
                                <i class="fas fa-question-circle ms-1 text-secondary" 
                                   data-bs-toggle="tooltip" 
                                   title="Não foi possível determinar o status do totem desta loja."></i>
                            </small>
                        </div>
                    `;
                }
                
                li.className = 'list-group-item list-group-item-action';
                
                li.innerHTML = `
                    <div class="d-flex justify-content-between align-items-start w-100">
                        <div>
                            <div class="d-flex align-items-center">
                                <span class="status-indicator status-offline me-2"></span>
                                <strong>${loja.codigo}</strong>
                                <span class="badge bg-secondary ms-2">${loja.estado}</span>
                            </div>
                            <div class="small text-muted mt-1">
                                <div><i class="far fa-clock me-1"></i> Offline há ${tempoOffline}</div>
                                <div><i class="far fa-calendar-alt me-1"></i> Última conexão: ${ultimaAtualizacao}</div>
                            </div>
                            ${totemStatusHTML}
                        </div>
                        <div class="text-end">
                            <div class="badge bg-primary mb-1">${totalDispositivos} máquinas</div>
                            <div class="small">
                                <span class="badge bg-info text-white">${qtdLavadoras} <i class="fas fa-tshirt"></i></span>
                                <span class="badge bg-info text-white">${qtdSecadoras} <i class="fas fa-wind"></i></span>
                            </div>
                        </div>
                    </div>
                `;
                
                // Adiciona ao início da lista (antes do elemento "no-lojas-offline")
                lojasOfflineList.insertBefore(li, noLojasOffline);
                
                // Inicializar tooltips nos novos elementos
                const tooltips = li.querySelectorAll('[data-bs-toggle="tooltip"]');
                tooltips.forEach(tooltip => {
                    new bootstrap.Tooltip(tooltip);
                });
            });
        }
    }
    
    // Atualiza listas de totems desligados
    if (totemsOfflineBadge && totemsOfflineList) {
        // Obter valores dos filtros
        const regiaoFiltro = totemsOfflineRegiao ? totemsOfflineRegiao.value : '';
        const estadoFiltro = totemsOfflineEstado ? totemsOfflineEstado.value : '';
        
        // Filtrar totems desligados com base na região e estado
        let totemsDesligadosFiltrados = totemsDesligados;
        
        if (regiaoFiltro) {
            totemsDesligadosFiltrados = totemsDesligadosFiltrados.filter(loja => loja.regiao === regiaoFiltro);
        }
        
        if (estadoFiltro) {
            totemsDesligadosFiltrados = totemsDesligadosFiltrados.filter(loja => loja.estado === estadoFiltro);
        }
        
        // Atualiza o badge com o número de totems desligados (total sem filtro)
        totemsOfflineBadge.textContent = totemsDesligados.length;
        
        // Limpa a lista atual
        while (totemsOfflineList.firstChild) {
            if (totemsOfflineList.firstChild.id === 'no-totems-offline') {
                break;
            }
            totemsOfflineList.removeChild(totemsOfflineList.firstChild);
        }
        
        // Mostra mensagem se não houver totems desligados após filtro
        if (totemsDesligadosFiltrados.length === 0) {
            if (noTotemsOffline) {
                // Mensagem personalizada se há totems desligados mas foram filtrados
                if (totemsDesligados.length > 0) {
                    noTotemsOffline.innerHTML = `
                        <i class="fas fa-filter me-2"></i>Nenhum totem desligado corresponde aos filtros
                    `;
                } else {
                    noTotemsOffline.innerHTML = `
                        <i class="fas fa-check-circle me-2"></i>Todos os totems estão ligados
                    `;
                }
                noTotemsOffline.style.display = 'block';
            }
        } else {
            if (noTotemsOffline) {
                noTotemsOffline.style.display = 'none';
            }
            
            // Adiciona cada totem desligado à lista
            totemsDesligadosFiltrados.forEach(loja => {
                const li = document.createElement('a');
                li.href = `loja.html?id=${loja.codigo}`;
                
                // Buscar os dados completos da loja
                const lojaCompleta = todasLojas.find(l => l.codigo === loja.codigo);
                if (!lojaCompleta) return;
                
                // Formatar a data da última atualização
                let ultimaAtualizacao = 'Desconhecida';
                if (loja.ultimaAtualizacao) {
                    ultimaAtualizacao = formatarData(loja.ultimaAtualizacao);
                }
                
                // Contar dispositivos
                const qtdLavadoras = contarDispositivos(lojaCompleta.dados, 'lavadoras');
                const qtdSecadoras = contarDispositivos(lojaCompleta.dados, 'secadoras');
                const totalDispositivos = qtdLavadoras + qtdSecadoras;
                
                li.className = 'list-group-item list-group-item-action';
                
                li.innerHTML = `
                    <div class="d-flex justify-content-between align-items-start w-100">
                        <div>
                            <div class="d-flex align-items-center">
                                <span class="status-indicator status-online me-2"></span>
                                <strong>${loja.codigo}</strong>
                                <span class="badge bg-secondary ms-2">${loja.estado}</span>
                            </div>
                            <div class="small text-muted mt-1">
                                <div><i class="fas fa-desktop me-1"></i> Totem <span class="text-warning fw-bold">OFFLINE</span></div>
                                <div><i class="far fa-calendar-alt me-1"></i> Última atualização: ${ultimaAtualizacao}</div>
                            </div>
                        </div>
                        <div class="text-end">
                            <div class="badge bg-primary mb-1">${totalDispositivos} máquinas</div>
                            <div class="small">
                                <span class="badge bg-info text-white">${qtdLavadoras} <i class="fas fa-tshirt"></i></span>
                                <span class="badge bg-info text-white">${qtdSecadoras} <i class="fas fa-wind"></i></span>
                            </div>
                        </div>
                    </div>
                `;
                
                // Adiciona ao início da lista (antes do elemento "no-totems-offline")
                totemsOfflineList.insertBefore(li, noTotemsOffline);
                
                // Inicializar tooltips nos novos elementos
                const tooltips = li.querySelectorAll('[data-bs-toggle="tooltip"]');
                tooltips.forEach(tooltip => {
                    new bootstrap.Tooltip(tooltip);
                });
            });
        }
    }
    
    // Atualizar marcadores no mapa
    atualizarMarcadoresMapa();
}

// Função para carregar as lojas do Firebase
function carregarLojas() {
    // Evitar carregamentos simultâneos
    if (lojasBeingLoaded) {
        console.log('Carregamento de lojas já em andamento. Ignorando chamada duplicada.');
        return;
    }
    lojasBeingLoaded = true;

    // Mostrar indicador de carregamento mais informativo
    if (lojasTableBody) {
        lojasTableBody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-4">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Carregando...</span>
                    </div>
                    <p class="mt-2 mb-0">Verificando cache de lojas...</p>
                </td>
            </tr>
        `;
    }

    // Tentar carregar do cache primeiro
    const lojasCache = carregarLojasDoCache();
    
    if (lojasCache) {
        // Se temos dados em cache, usá-los imediatamente
        processarLojasCarregadas(lojasCache, true);
        
        // Atualizar em segundo plano com delay para evitar sobrecarga
        setTimeout(() => {
        carregarLojasDoFirebase(true);
            lojasBeingLoaded = false;
        }, 2000);
    } else {
        // Se não há cache, carregar diretamente do Firebase
        carregarLojasDoFirebase(false);
        lojasBeingLoaded = false;
    }
}

// Função para carregar lojas do Firebase
function carregarLojasDoFirebase(atualizacaoEmSegundoPlano = false) {
    // Limitar a quantidade de dados obtidos com shallow e evitar recargas desnecessárias
    database.ref('/').limitToFirst(100).once('value', snapshot => {
        // Remove o elemento de loading se não estiver em segundo plano
        if (loadingRow && !atualizacaoEmSegundoPlano) {
            loadingRow.remove();
            }
            
            // Verifica se existem lojas
            if (!snapshot.exists()) {
            if (lojasTableBody && !atualizacaoEmSegundoPlano) {
                lojasTableBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="text-center py-4">
                            <div class="alert alert-warning">
                                <i class="fas fa-exclamation-triangle me-2"></i>
                                Foram encontrados dados no Firebase, mas nenhuma loja válida foi identificada.
                        </div>
                        </td>
                    </tr>
                `;
            }
                return;
            }
            
            // Itera sobre as lojas
            const lojas = snapshot.val();
            let lojasProcessadas = [];
            let encontrouLojas = false;
            let lojasFiltradas = 0;
            
            // Carregar dados básicos primeiro para exibição rápida
            for (const codigo in lojas) {
                // Ignorar nós especiais como "status_history" que não são lojas
                if (codigo === 'status_history') {
                    lojasFiltradas++;
                    console.log(`Ignorando nó especial: ${codigo}`);
                    continue;
                }
                
                // Verificação básica se é uma loja válida
                const loja = lojas[codigo];
                if (typeof loja === 'object') {
                    encontrouLojas = true;
                    
                    // Armazenar a loja para processamento
                    lojasProcessadas.push({
                        codigo: codigo,
                        dados: loja
                    });
                }
            }
            
            console.log(`Lojas carregadas: ${lojasProcessadas.length}, Nós ignorados: ${lojasFiltradas}`);
            
            // Processar as lojas carregadas
            if (lojasProcessadas.length > 0) {
                processarLojasCarregadas(lojasProcessadas, atualizacaoEmSegundoPlano);
                
                // Salvar no cache apenas se não for uma atualização em segundo plano
                if (!atualizacaoEmSegundoPlano) {
                    salvarLojasNoCache(lojasProcessadas);
                    // Atualizar badge de fonte de dados
                    atualizarBadgeFonteDados('firebase');
                } else if (cacheUsado) {
                    // Se estamos atualizando dados que vieram do cache, atualizar o cache
                    salvarLojasNoCache(todasLojas);
                    // Atualizar badge de fonte de dados indicando atualização em segundo plano
                    atualizarBadgeFonteDados('atualizado');
                }
            }
            
            // Se não encontrou lojas válidas e não é atualização em segundo plano
            if (!encontrouLojas && !atualizacaoEmSegundoPlano && lojasTableBody) {
                lojasTableBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="text-center py-4">
                            <div class="alert alert-warning">
                                <i class="fas fa-exclamation-triangle me-2"></i>
                                Foram encontrados dados no Firebase, mas nenhuma loja válida foi identificada.
                            </div>
                        </td>
                    </tr>
                `;
            }
    }, error => {
            console.error("Erro ao carregar lojas:", error);
        if (loadingRow && !atualizacaoEmSegundoPlano) {
            loadingRow.remove();
            }
        if (lojasTableBody && !atualizacaoEmSegundoPlano) {
            lojasTableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-4">
                    <div class="alert alert-danger">
                        <i class="fas fa-exclamation-circle me-2"></i>
                        Erro ao carregar lojas: ${error.message}
                    </div>
                    </td>
                </tr>
            `;
        }
        
        // Atualizar badge em caso de erro
        if (!atualizacaoEmSegundoPlano) {
            atualizarBadgeFonteDados('erro');
        }
    });
}

// Função para processar lojas carregadas (do cache ou Firebase)
function processarLojasCarregadas(lojasProcessadas, atualizacaoEmSegundoPlano = false) {
    // Evitar processamentos simultâneos
    if (processamentoEmAndamento) {
        console.log('Processamento já em andamento. Ignorando chamada duplicada.');
        return;
    }
    processamentoEmAndamento = true;

    try {
        // Filtrar nós especiais como 'status_history'
        todasLojas = Object.entries(lojasProcessadas)
            .filter(([key]) => key !== 'status_history' && key !== 'metadata')
            .map(([codigo, dados]) => ({
                codigo,
                ...dados
            }));
    
    // Se não for atualização em segundo plano ou todasLojas estava vazio antes
    if (!atualizacaoEmSegundoPlano || cacheUsado) {
            // Atualizar estatísticas com delay para evitar sobrecarga
            setTimeout(() => {
        atualizarEstatisticasDebounced();
                // Aplicar filtros com delay adicional
                setTimeout(() => {
        filtrarLojasDebounced();
                    processamentoEmAndamento = false;
                }, 500);
            }, 500);
        
        // Configurar listeners apenas para as primeiras 10 lojas
        const lojasParaListener = todasLojas.slice(0, 10);
        lojasParaListener.forEach(loja => {
            configurarStatusListener(loja.codigo);
        });
        } else {
            processamentoEmAndamento = false;
    }
    
    // Se veio do cache, marcar flag
    if (!atualizacaoEmSegundoPlano) {
        cacheUsado = false;
        }
    } catch (error) {
        console.error('Erro ao processar lojas:', error);
        processamentoEmAndamento = false;
    }
}

// Função para salvar os dados de lojas no cache
function salvarLojasNoCache(lojas) {
    try {
        // Filtrar nós especiais antes de salvar no cache
        const lojasFiltradas = lojas.filter(loja => loja.codigo !== 'status_history');
        
        // Salvar os dados das lojas
        localStorage.setItem(CACHE_KEY_LOJAS, JSON.stringify(lojasFiltradas));
        
        // Salvar o timestamp atual
        localStorage.setItem(CACHE_KEY_TIMESTAMP, Date.now().toString());
        
        console.log(`Dados de lojas salvos em cache com sucesso (${lojasFiltradas.length} lojas)`);
    } catch (error) {
        console.error('Erro ao salvar dados de lojas no cache:', error);
        // Se falhar, tenta limpar o localStorage para liberar espaço
        try {
            localStorage.clear();
            console.log('localStorage foi limpo devido a erro ao salvar');
        } catch (e) {
            console.error('Falha ao limpar localStorage:', e);
        }
    }
}

// Função para carregar os dados de lojas do cache
function carregarLojasDoCache() {
    try {
        // Verificar se existe cache
        const cachedTimestamp = localStorage.getItem(CACHE_KEY_TIMESTAMP);
        if (!cachedTimestamp) return null;
        
        // Verificar se o cache está expirado
        const timestamp = parseInt(cachedTimestamp);
        const agora = Date.now();
        if (agora - timestamp > CACHE_EXPIRY_TIME) {
            console.log('Cache de lojas expirado, será recarregado do Firebase');
            return null;
        }
        
        // Carregar os dados das lojas
        const cachedLojas = localStorage.getItem(CACHE_KEY_LOJAS);
        if (!cachedLojas) return null;
        
        // Converter os dados JSON para objeto
        let lojas = JSON.parse(cachedLojas);
        
        // Filtrar nós especiais como 'status_history'
        lojas = lojas.filter(loja => loja.codigo !== 'status_history');
        
        console.log(`Cache de lojas carregado com sucesso (${lojas.length} lojas após filtrar nós especiais)`);
        
        // Calcular e exibir o tempo desde a última atualização
        const tempoDesdeAtualizacao = formatarTempoRelativo(agora - timestamp);
        mostrarIndicadorDadosCache(tempoDesdeAtualizacao);
        
        // Atualizar badge de fonte de dados
        atualizarBadgeFonteDados('cache', tempoDesdeAtualizacao);
        
        // Marcar que estamos usando cache
        cacheUsado = true;
        
        return lojas;
    } catch (error) {
        console.error('Erro ao carregar cache de lojas:', error);
        return null;
    }
}

// Função para mostrar indicador de dados em cache
function mostrarIndicadorDadosCache(tempoDesdeAtualizacao) {
    // Criar div de notificação, se não existir
    let cacheNotification = document.getElementById('cache-notification');
    if (!cacheNotification) {
        cacheNotification = document.createElement('div');
        cacheNotification.id = 'cache-notification';
        cacheNotification.className = 'cache-notification';
        cacheNotification.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background-color: #f8f9fa;
            border: 1px solid #dee2e6;
            border-left: 4px solid #0d6efd;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            padding: 10px 15px;
            border-radius: 6px;
            z-index: 1050;
            font-size: 0.9rem;
            max-width: 300px;
            transform: translateY(100px);
            opacity: 0;
            transition: transform 0.3s ease, opacity 0.3s ease;
        `;
        
        // Adicionar à página
        document.body.appendChild(cacheNotification);
    }
    
    // Atualizar conteúdo
    cacheNotification.innerHTML = `
        <div class="d-flex align-items-center">
            <div class="me-2">
                <i class="fas fa-database text-primary"></i>
            </div>
            <div>
                <div class="fw-bold">Dados carregados do cache</div>
                <div class="small text-muted">Última atualização: ${tempoDesdeAtualizacao}</div>
                <div class="small mt-1">
                    <a href="#" id="refresh-data" class="text-primary">
                        <i class="fas fa-sync-alt me-1"></i>Atualizar agora
                    </a>
                </div>
            </div>
            <button type="button" class="btn-close ms-3" aria-label="Close"></button>
        </div>
    `;
    
    // Mostrar notificação com animação
    setTimeout(() => {
        cacheNotification.style.transform = 'translateY(0)';
        cacheNotification.style.opacity = '1';
    }, 100);
    
    // Adicionar evento de clique para fechar
    const closeBtn = cacheNotification.querySelector('.btn-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            cacheNotification.style.transform = 'translateY(100px)';
            cacheNotification.style.opacity = '0';
            setTimeout(() => {
                cacheNotification.remove();
            }, 300);
        });
    }
    
    // Adicionar evento de clique para atualizar dados
    const refreshBtn = cacheNotification.querySelector('#refresh-data');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Mostrar loading
            cacheNotification.innerHTML = `
                <div class="d-flex align-items-center">
                    <div class="spinner-border spinner-border-sm text-primary me-2" role="status">
                        <span class="visually-hidden">Carregando...</span>
                    </div>
                    <div>Atualizando dados do Firebase...</div>
                </div>
            `;
            
            // Limpar cache e recarregar
            localStorage.removeItem(CACHE_KEY_LOJAS);
            localStorage.removeItem(CACHE_KEY_TIMESTAMP);
            
            // Recarregar a página para atualizar os dados
            window.location.reload();
        });
    }
    
    // Auto-esconder após 10 segundos
    setTimeout(() => {
        if (cacheNotification && document.body.contains(cacheNotification)) {
            cacheNotification.style.transform = 'translateY(100px)';
            cacheNotification.style.opacity = '0';
            setTimeout(() => {
                if (cacheNotification && document.body.contains(cacheNotification)) {
                    cacheNotification.remove();
                }
            }, 300);
        }
    }, 10000);
}

// Função para formatar tempo relativo
function formatarTempoRelativo(ms) {
    const segundos = Math.floor(ms / 1000);
    
    if (segundos < 60) {
        return 'agora mesmo';
    } else if (segundos < 60 * 60) {
        const minutos = Math.floor(segundos / 60);
        return `há ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}`;
    } else if (segundos < 60 * 60 * 24) {
        const horas = Math.floor(segundos / (60 * 60));
        return `há ${horas} ${horas === 1 ? 'hora' : 'horas'}`;
    } else {
        const dias = Math.floor(segundos / (60 * 60 * 24));
        return `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
    }
}

// Função para configurar listeners para atualizações de status em tempo real
function configurarStatusListener(codigo) {
    // Listener para status da loja no Firebase, sem verificações de tempo
    const statusRef = database.ref(`/${codigo}/pc_status/status`);
    statusRef.on('value', (snapshot) => {
        // Quando o status mudar, buscar todas as informações da loja
        database.ref(`/${codigo}`).once('value')
            .then(lojaSnapshot => {
                if (lojaSnapshot.exists()) {
                    const loja = lojaSnapshot.val();
                    // Atualiza o card da loja com as novas informações
                    atualizarStatusLoja(codigo, loja);
                    // Atualiza o status no mapa se estiver disponível
                    if (typeof atualizarMarcadoresMapa === 'function') {
                        atualizarMarcadoresMapa();
                    }
                }
            })
            .catch(error => {
                console.error(`Erro ao atualizar status da loja ${codigo}:`, error);
            });
    });
    
    // Listener específico para o status do totem
    const motherboardRef = database.ref(`/${codigo}/status_motherboard`);
    motherboardRef.on('value', (snapshot) => {
        if (snapshot.exists()) {
            const status = snapshot.val();
            
            // Busca o elemento do card no DOM
            const cardElement = document.querySelector(`.card[data-loja="${codigo}"]`);
            if (cardElement) {
                const motherboardStatusText = cardElement.querySelector('.motherboard-status');
                const motherboardIndicator = cardElement.querySelector('.motherboard-indicator');
                
                // Atualiza o texto e o indicador visual
                if (motherboardStatusText && motherboardIndicator) {
                    const isMotherboardOn = status === 'ON';
                    motherboardStatusText.textContent = `Totem: ${isMotherboardOn ? 'ON' : 'OFF'}`;
                    motherboardStatusText.className = `${isMotherboardOn ? 'text-success' : 'text-danger'} fw-medium motherboard-status small-text`;
                    
                    // Atualiza o indicador de status
                    motherboardIndicator.classList.remove('status-online', 'status-offline');
                    motherboardIndicator.classList.add(isMotherboardOn ? 'status-online' : 'status-offline');
                }
            }
        }
    });
}

// Função para limpar todos os filtros
function limparFiltros() {
    searchInput.value = '';
    regionFilter.value = '';
    stateFilter.value = '';
    statusFilter.value = '';
    totemFilter.value = '';
    
    // Resetar o select de estados
    stateFilter.innerHTML = '<option value="">Todos os Estados</option>';
    
    // Aplicar filtros (agora todos vazios) com debounce
    filtrarLojasDebounced();
}

// Função para inicializar o mapa
function inicializarMapa() {
    // Verificar se o elemento do mapa existe
    const mapElement = document.getElementById('brasil-map');
    if (!mapElement) return;
    
    // Inicializar o mapa centralizado no Brasil
    brasilMap = L.map('brasil-map').setView([-15.77972, -47.92972], 4);
    
    // Adicionar camada de mapa
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(brasilMap);
}

// Função para criar marcador para uma loja específica com suas coordenadas
function criarMarcadorLoja(codigo, loja, coordenadas) {
    // Verificar status da loja
    const statusInfo = determinarStatus(loja);
    const isOnline = statusInfo.status === "Online";
    
    // Determinar a classe do marcador (apenas online/offline)
    let markerClass = isOnline ? 'map-marker-online' : 'map-marker-offline';
    
    // Criar ícone personalizado
    const markerIcon = L.divIcon({
        className: markerClass,
        html: `<div style="width:100%;height:100%;"></div>`,
        iconSize: [18, 18], // Aumentado para facilitar o clique com mouse
        iconAnchor: [9, 9]
    });
    
    // Criar marcador
    const marker = L.marker([coordenadas.lat, coordenadas.lon], { icon: markerIcon });
    
    // Formatar última atualização
    const timestamp = loja.pc_status ? loja.pc_status.timestamp : null;
    const ultimaAtualizacaoFormatada = timestamp ? formatarData(timestamp) : "Desconhecida";
    
    // Contar equipamentos da loja
    const qtdLavadoras = contarDispositivos(loja, 'lavadoras');
    const qtdSecadoras = contarDispositivos(loja, 'secadoras');
    const qtdDosadoras = contarDispositivos(loja, 'dosadora_01');
    const temArCond = contarDispositivos(loja, 'ar_condicionado') > 0;
    
    // Determinar a região e o estado
    const { regiao, estado } = getLojaRegionAndState(codigo);
    
    // Obter o heartbeat se disponível
    const heartbeat = loja.heartbeat ? loja.heartbeat : "N/A";
    
    // Determinar quanto tempo passou desde a última atualização em formato legível
    let tempoDesdeAtualizacao = "";
    if (timestamp) {
        const agora = Date.now();
        const diferenca = agora - timestamp;
        
        if (diferenca < 60 * 1000) { // Menos de 1 minuto
            tempoDesdeAtualizacao = "Agora mesmo";
        } else if (diferenca < 60 * 60 * 1000) { // Menos de 1 hora
            const minutos = Math.floor(diferenca / (60 * 1000));
            tempoDesdeAtualizacao = `há ${minutos} minuto${minutos > 1 ? 's' : ''}`;
        } else if (diferenca < 24 * 60 * 60 * 1000) { // Menos de 1 dia
            const horas = Math.floor(diferenca / (60 * 60 * 1000));
            tempoDesdeAtualizacao = `há ${horas} hora${horas > 1 ? 's' : ''}`;
        } else {
            const dias = Math.floor(diferenca / (24 * 60 * 60 * 1000));
            tempoDesdeAtualizacao = `há ${dias} dia${dias > 1 ? 's' : ''}`;
        }
    }
    
    // Criar conteúdo do popup com design aprimorado
    let popupContent = `
        <div class="map-popup-content">
            <div class="text-center mb-3">
                <h5 class="mb-1">${codigo}</h5>
                <div class="text-muted">${estadosNomes[estado] || estado}, ${regiao.charAt(0).toUpperCase() + regiao.slice(1)}</div>
            </div>
            
            <a href="loja.html?id=${codigo}" class="btn btn-primary d-block w-100" style="color: white; font-weight: 500; padding: 8px 12px;">
                <i class="fas fa-store me-2"></i>Ver detalhes
            </a>
        </div>
    `;
    
    // Adicionar popup ao marcador
    marker.bindPopup(popupContent, {
        maxWidth: 280,
        minWidth: 250,
        className: 'store-popup'
    });
    
    return marker;
}

// Função para atualizar os marcadores no mapa
function atualizarMarcadoresMapa() {
    // Se o mapa não foi inicializado, não fazer nada
    if (!brasilMap) return;
    
    // Limpar marcadores existentes
    mapMarkers.forEach(marker => {
        brasilMap.removeLayer(marker);
    });
    mapMarkers = [];
    
    // Array para armazenar marcadores individuais de lojas com coordenadas
    let marcadoresLojas = [];
    
    // Objeto para agrupar lojas por estado (usado apenas como fallback)
    const lojasPorEstado = {};
    
    // Processar todas as lojas
    todasLojas.forEach(loja => {
        const { estado } = getLojaRegionAndState(loja.codigo);
        
        // Inicializar o objeto do estado se ainda não existir
        if (!lojasPorEstado[estado]) {
            lojasPorEstado[estado] = {
                online: 0,
                offline: 0,
                lojas: [],
                ultimaAtualizacao: null,
                dispositivos: {
                    lavadoras: 0,
                    secadoras: 0,
                    arCondicionado: 0,
                    dosadoras: 0
                }
            };
        }
        
        // Verificar status da loja
        const statusInfo = determinarStatus(loja.dados);
        const isOnline = statusInfo.status === "Online";
        
        // Verificar status do totem
        const totemOff = loja.dados.status_motherboard === 'OFF';
        
        // Atualizar última atualização
        const timestamp = loja.dados.pc_status ? loja.dados.pc_status.timestamp : null;
        if (timestamp && (!lojasPorEstado[estado].ultimaAtualizacao || timestamp > lojasPorEstado[estado].ultimaAtualizacao)) {
            lojasPorEstado[estado].ultimaAtualizacao = timestamp;
        }
        
        // Incrementar contadores (apenas online/offline)
        if (isOnline) {
            lojasPorEstado[estado].online++;
        } else {
            lojasPorEstado[estado].offline++;
        }
        
        // Contar dispositivos
        lojasPorEstado[estado].dispositivos.lavadoras += contarDispositivos(loja.dados, 'lavadoras');
        lojasPorEstado[estado].dispositivos.secadoras += contarDispositivos(loja.dados, 'secadoras');
        lojasPorEstado[estado].dispositivos.arCondicionado += contarDispositivos(loja.dados, 'ar_condicionado');
        lojasPorEstado[estado].dispositivos.dosadoras += contarDispositivos(loja.dados, 'dosadora_01');
        
        // Adicionar informações da loja
        lojasPorEstado[estado].lojas.push({
            codigo: loja.codigo,
            status: statusInfo.status,
            totemStatus: loja.dados.status_motherboard,
            ultimaAtualizacao: timestamp
        });
        
        // PRIORIDADE: Verificar se a loja tem coordenadas e criar marcador individual
        if (loja.dados.coordenadas && loja.dados.coordenadas.lat && loja.dados.coordenadas.lon) {
            const marcadorLoja = criarMarcadorLoja(loja.codigo, loja.dados, loja.dados.coordenadas);
            marcadoresLojas.push(marcadorLoja);
        }
    });
    
    // PASSO 1: Adicionar TODOS os marcadores de lojas individuais ao mapa
    // Independentemente de quantos existam - prioridade máxima para usar coordenadas reais
    marcadoresLojas.forEach(marker => {
        marker.addTo(brasilMap);
        mapMarkers.push(marker);
    });
    
    // PASSO 2: Apenas se não houver NENHUM marcador individual, usamos os marcadores de estado como fallback
    if (marcadoresLojas.length === 0) {
        // Adicionar marcadores para cada estado com lojas
        Object.keys(lojasPorEstado).forEach(estado => {
            // Verificar se temos coordenadas para este estado
            if (!coordenadasEstados[estado]) return;
            
            const dadosEstado = lojasPorEstado[estado];
            const totalLojas = dadosEstado.online + dadosEstado.offline;
            
            // Ignorar estados sem lojas
            if (totalLojas === 0) return;
            
            // Formatar última atualização
            let ultimaAtualizacaoFormatada = "Desconhecida";
            if (dadosEstado.ultimaAtualizacao) {
                ultimaAtualizacaoFormatada = formatarData(dadosEstado.ultimaAtualizacao);
            }
            
            // Calcular a porcentagem de lojas online
            const percentOnline = totalLojas > 0 ? Math.round((dadosEstado.online / totalLojas) * 100) : 0;
            
            // Determinar a classe do marcador com base no estado predominante (apenas online/offline)
            let markerClass = 'map-marker-online';
            if (dadosEstado.offline > dadosEstado.online) {
                markerClass = 'map-marker-offline';
            }
            
            // Criar ícone personalizado
            const markerIcon = L.divIcon({
                className: markerClass,
                html: `<div style="width:100%;height:100%;"></div>`,
                iconSize: [18, 18],
                iconAnchor: [9, 9]
            });
            
            // Criar marcador
            const marker = L.marker(coordenadasEstados[estado], { icon: markerIcon });
            
            // Criar conteúdo do popup
            let popupContent = `
                <div class="map-popup-content">
                    <h6>${estado} - ${estadosNomes[estado]}</h6>
                    <div class="d-flex justify-content-center align-items-center gap-2 mb-2">
                        <span class="badge bg-primary">${totalLojas} lojas</span>
                        <div class="progress" style="height: 8px; width: 80px;">
                            <div class="progress-bar bg-success" role="progressbar" style="width: ${percentOnline}%"></div>
                        </div>
                        <small>${percentOnline}% online</small>
                    </div>
                    
                    <div class="d-flex justify-content-center gap-2 mb-3">
                        <span class="badge bg-success">${dadosEstado.online} online</span>
                        <span class="badge bg-danger">${dadosEstado.offline} offline</span>
                    </div>
                    
                    <div class="small text-muted mb-2">
                        Última atualização: ${ultimaAtualizacaoFormatada}
                    </div>
                    
                    <hr class="my-2">
                    
                    <div class="small mb-0">
                        <div class="row g-2">
                            <div class="col-6 text-start">
                                <i class="fas fa-tshirt"></i> ${dadosEstado.dispositivos.lavadoras} lavadoras
                            </div>
                            <div class="col-6 text-start">
                                <i class="fas fa-wind"></i> ${dadosEstado.dispositivos.secadoras} secadoras
                            </div>
                            <div class="col-6 text-start">
                                <i class="fas fa-snowflake"></i> ${dadosEstado.dispositivos.arCondicionado} ar-cond.
                            </div>
                            <div class="col-6 text-start">
                                <i class="fas fa-prescription-bottle"></i> ${dadosEstado.dispositivos.dosadoras} dosadoras
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            // Adicionar popup ao marcador
            marker.bindPopup(popupContent, {
                maxWidth: 300
            });
            
            // Adicionar ao mapa
            marker.addTo(brasilMap);
            
            // Guardar referência para limpar depois
            mapMarkers.push(marker);
        });
    }
}

// Função de debounce para limitar a frequência de chamadas de funções
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

// Versões com debounce de funções que eram chamadas muito frequentemente
const atualizarEstatisticasDebounced = debounce(atualizarEstatisticas, 2000);
const filtrarLojasDebounced = debounce(filtrarLojas, 1000);

// Flag para controlar inicialização
let appInitialized = false;

// Inicializar a aplicação quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', function() {
    // Evitar inicialização duplicada
    if (appInitialized) {
        console.log('App já foi inicializado. Ignorando chamada duplicada.');
        return;
    }
    appInitialized = true;

    try {
        // Verificar se elementos principais existem antes de continuar
        if (!lojasTableBody) {
            console.warn("Elemento lojasTableBody não encontrado. Algumas funcionalidades podem não funcionar corretamente.");
        }
        
        // Configurar filtros
    if (regionFilter) {
            regionFilter.addEventListener('change', function() {
                try {
                    // Atualizar o select de estados com base na região selecionada
                    if (stateFilter) {
                        preencherSelectEstados(stateFilter, this.value);
                    }
            
                    // Aplicar filtros com debounce
                    filtrarLojasDebounced();
                } catch (error) {
                    console.error("Erro ao aplicar filtro de região:", error);
                }
        });
    }
    
    if (stateFilter) {
            stateFilter.addEventListener('change', function() {
                try {
                    filtrarLojasDebounced();
                } catch (error) {
                    console.error("Erro ao aplicar filtro de estado:", error);
                }
            });
        }
        
    if (statusFilter) {
            statusFilter.addEventListener('change', function() {
                try {
                    filtrarLojasDebounced();
                } catch (error) {
                    console.error("Erro ao aplicar filtro de status:", error);
                }
            });
    }
    
    if (totemFilter) {
            totemFilter.addEventListener('change', function() {
                try {
                    filtrarLojasDebounced();
                } catch (error) {
                    console.error("Erro ao aplicar filtro de totem:", error);
                }
            });
        }
        
        if (searchInput) {
            // Desativa o comportamento padrão de busca do DataTables já que usamos filtro personalizado
            searchInput.addEventListener('keyup', function(e) {
                try {
                    // Previne que o evento seja capturado pelo DataTables
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                        filtrarLojasDebounced();
                    }
                } catch (error) {
                    console.error("Erro na busca por texto:", error);
                }
            });
            
            // Conectar o botão de busca ao lado do input
            const searchButton = searchInput.parentElement?.querySelector('button');
            if (searchButton) {
                searchButton.addEventListener('click', function() {
                    try {
                        filtrarLojasDebounced();
                    } catch (error) {
                        console.error("Erro ao buscar com botão:", error);
                    }
                });
            }
        }
        
    if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', function() {
                try {
                    limparFiltros();
                } catch (error) {
                    console.error("Erro ao limpar filtros:", error);
                }
            });
    }
    
    // Configurar eventos para o modal de reset em lote
        if (resetScopeRegion) {
            resetScopeRegion.addEventListener('change', function() {
                try {
                    if (this.checked && resetRegionContainer) {
                        resetRegionContainer.style.display = 'block';
                        if (resetStateContainer) resetStateContainer.style.display = 'none';
                        // Preencher select de estados no modal com base na região selecionada
                        if (resetState && resetRegion) {
                            preencherSelectEstados(resetState, resetRegion.value);
                        }
        atualizarContadorLojasAfetadas();
                    }
                } catch (error) {
                    console.error("Erro ao mudar escopo para região:", error);
                }
            });
        }
        
        if (resetScopeState) {
            resetScopeState.addEventListener('change', function() {
                try {
                    if (this.checked) {
                        if (resetRegionContainer) resetRegionContainer.style.display = 'none';
                        if (resetStateContainer) resetStateContainer.style.display = 'block';
                        atualizarContadorLojasAfetadas();
                    }
                } catch (error) {
                    console.error("Erro ao mudar escopo para estado:", error);
                }
            });
        }
        
        if (resetScopeFiltered) {
            resetScopeFiltered.addEventListener('change', function() {
                try {
                    if (this.checked) {
                        if (resetRegionContainer) resetRegionContainer.style.display = 'none';
                        if (resetStateContainer) resetStateContainer.style.display = 'none';
                        atualizarContadorLojasAfetadas();
                    }
                } catch (error) {
                    console.error("Erro ao mudar escopo para filtrado:", error);
                }
            });
        }
        
        if (resetRegion) {
            resetRegion.addEventListener('change', function() {
                try {
                    // Preencher select de estados no modal com base na região selecionada
                    if (resetState) {
                        preencherSelectEstados(resetState, this.value);
                    }
        atualizarContadorLojasAfetadas();
                } catch (error) {
                    console.error("Erro ao mudar região no reset:", error);
                }
            });
        }
        
        if (resetState) {
            resetState.addEventListener('change', function() {
                try {
        atualizarContadorLojasAfetadas();
                } catch (error) {
                    console.error("Erro ao mudar estado no reset:", error);
                }
            });
        }
        
        if (confirmBatchResetBtn) {
            confirmBatchResetBtn.addEventListener('click', function() {
                try {
                    executarResetEmLote();
                } catch (error) {
                    console.error("Erro ao executar reset em lote:", error);
                }
            });
        }
        
        // Configurar eventos para filtros das listas de problemas
        if (lojasOfflineRegiao) {
            lojasOfflineRegiao.addEventListener('change', function() {
                try {
                    // Atualizar o select de estados com base na região selecionada
                    if (lojasOfflineEstado) {
                        preencherSelectEstados(lojasOfflineEstado, this.value);
                    }
                    // Atualizar listas com filtros
                    atualizarEstatisticasDebounced();
                } catch (error) {
                    console.error("Erro ao filtrar lojas offline por região:", error);
                }
            });
        }
        
        if (lojasOfflineEstado) {
            lojasOfflineEstado.addEventListener('change', function() {
                try {
                    atualizarEstatisticasDebounced();
                } catch (error) {
                    console.error("Erro ao filtrar lojas offline por estado:", error);
                }
            });
        }
        
        if (totemsOfflineRegiao) {
            totemsOfflineRegiao.addEventListener('change', function() {
                try {
                    // Atualizar o select de estados com base na região selecionada
                    if (totemsOfflineEstado) {
                        preencherSelectEstados(totemsOfflineEstado, this.value);
                            }
                    // Atualizar listas com filtros
                    atualizarEstatisticasDebounced();
                } catch (error) {
                    console.error("Erro ao filtrar totems offline por região:", error);
                }
            });
        }
        
        if (totemsOfflineEstado) {
            totemsOfflineEstado.addEventListener('change', function() {
                try {
                            atualizarEstatisticasDebounced();
                } catch (error) {
                    console.error("Erro ao filtrar totems offline por estado:", error);
                }
            });
        }
        
        // Preencher os selects de estados com todos os estados por padrão
        if (lojasOfflineEstado) {
            try {
                preencherSelectEstados(lojasOfflineEstado, '');
            } catch (error) {
                console.error("Erro ao preencher estados de lojas offline:", error);
            }
            }
        
        if (totemsOfflineEstado) {
            try {
                preencherSelectEstados(totemsOfflineEstado, '');
            } catch (error) {
                console.error("Erro ao preencher estados de totems offline:", error);
            }
        }
        
        // Carregar filtros salvos, se existirem
        const filtrosCarregados = carregarFiltrosSalvos();
        
        // Carregar lojas (agora vai tentar do cache primeiro)
        carregarLojas();
        
        // Se os filtros foram carregados, aplicá-los após um pequeno delay
        // para garantir que as lojas já foram carregadas
        if (filtrosCarregados) {
            setTimeout(() => {
                filtrarLojasDebounced();
            }, 1000);
        }
        
        // Inicializar o mapa
        inicializarMapa();
        
        // Adicionar botão para limpar cache
        const clearCacheBtn = document.getElementById('clear-cache');
        if (clearCacheBtn) {
            clearCacheBtn.addEventListener('click', function() {
                try {
                    localStorage.removeItem(CACHE_KEY_LOJAS);
                    localStorage.removeItem(CACHE_KEY_TIMESTAMP);
                    Swal.fire({
                        icon: 'success',
                        title: 'Cache limpo',
                        text: 'Os dados serão recarregados do Firebase na próxima visita.',
                        confirmButtonColor: '#0d6efd'
                    }).then(() => {
                        // Recarregar a página para atualizar os dados
                        window.location.reload();
                    });
                } catch (error) {
                    console.error("Erro ao limpar cache:", error);
                    Swal.fire({
                        icon: 'error',
                        title: 'Erro',
                        text: 'Não foi possível limpar o cache: ' + error.message,
                        confirmButtonColor: '#0d6efd'
                    });
                }
            });
        }
        
        // Adicionar evento de clique para ordenar por offline
        setTimeout(() => {
            const ths = document.querySelectorAll('#lojas-table th');
            ths.forEach((th, idx) => {
                if (th.textContent.trim().toLowerCase() === 'equipamentos') {
                    th.style.cursor = 'pointer';
                    th.title = 'Clique para ordenar por mais offline';
                    th.addEventListener('click', function() {
                        ordenarPorOffline(idx);
                    });
                }
            });
        }, 1000);
    } catch (error) {
        console.error("Erro na inicialização da aplicação:", error);
    }
});

// Função para formatar o nome do estado
function formatarNomeEstado(sigla) {
    return estadosNomes[sigla] || sigla;
}

// Função para salvar os filtros atuais no localStorage
function salvarFiltros() {
    try {
        // Obter os valores atuais dos filtros
        const filtros = {
            busca: searchInput ? searchInput.value : '',
            regiao: regionFilter ? regionFilter.value : '',
            estado: stateFilter ? stateFilter.value : '',
            status: statusFilter ? statusFilter.value : '',
            totem: totemFilter ? totemFilter.value : ''
        };
        
        // Salvar no localStorage
        localStorage.setItem(FILTERS_KEY, JSON.stringify(filtros));
        console.log('Filtros salvos com sucesso');
    } catch (error) {
        console.error('Erro ao salvar filtros:', error);
    }
}

// Função para carregar os filtros salvos do localStorage
function carregarFiltrosSalvos() {
    try {
        // Carregar do localStorage
        const filtrosSalvos = localStorage.getItem(FILTERS_KEY);
        if (!filtrosSalvos) return false;
        
        // Converter para objeto
        const filtros = JSON.parse(filtrosSalvos);
        
        // Aplicar os valores aos inputs de filtro
        if (searchInput) searchInput.value = filtros.busca || '';
        if (regionFilter) regionFilter.value = filtros.regiao || '';
        
        // Se tiver região selecionada, precisamos atualizar o select de estados primeiro
        if (regionFilter && regionFilter.value && stateFilter) {
            preencherSelectEstados(stateFilter, regionFilter.value);
            // Então aplicar o valor do estado
            if (stateFilter) stateFilter.value = filtros.estado || '';
        }
        
        if (statusFilter) statusFilter.value = filtros.status || '';
        if (totemFilter) totemFilter.value = filtros.totem || '';
        
        console.log('Filtros carregados com sucesso');
        return true;
    } catch (error) {
        console.error('Erro ao carregar filtros salvos:', error);
        return false;
    }
}

// Função para limpar todos os filtros e remover do localStorage
function limparFiltros() {
    if (searchInput) searchInput.value = '';
    if (regionFilter) regionFilter.value = '';
    if (stateFilter) {
        stateFilter.innerHTML = '<option value="">Todos os Estados</option>';
        stateFilter.value = '';
    }
    if (statusFilter) statusFilter.value = '';
    if (totemFilter) totemFilter.value = '';
    
    // Remover do localStorage
    localStorage.removeItem(FILTERS_KEY);
    
    // Aplicar filtros (agora todos vazios) com debounce
    filtrarLojasDebounced();
}

// Função para atualizar a badge de fonte de dados
function atualizarBadgeFonteDados(fonte, tempoAtras = null) {
    const badge = document.getElementById('data-source-badge');
    const textoElement = document.getElementById('data-source-text');
    
    if (!badge || !textoElement) return;
    
    badge.classList.remove('d-none', 'bg-light', 'bg-primary', 'bg-success', 'bg-warning', 'bg-danger');
    
    let texto = '';
    let icone = '';
    let classe = '';
    
    switch (fonte) {
        case 'cache':
            texto = `Dados do cache (${tempoAtras})`;
            icone = 'database';
            classe = 'bg-warning text-dark';
            break;
        case 'firebase':
            texto = 'Dados em tempo real';
            icone = 'cloud-download-alt';
            classe = 'bg-primary text-white';
            break;
        case 'atualizado':
            texto = 'Dados atualizados';
            icone = 'sync-alt';
            classe = 'bg-success text-white';
            break;
        case 'erro':
            texto = 'Erro ao carregar dados';
            icone = 'exclamation-triangle';
            classe = 'bg-danger text-white';
            break;
        default:
            texto = 'Origem desconhecida';
            icone = 'question-circle';
            classe = 'bg-light text-dark';
    }
    
    // Atualizar a classe e o texto da badge
    badge.className = `badge ${classe}`;
    textoElement.innerHTML = texto;
    
    // Atualizar o ícone
    const iconeElement = badge.querySelector('i');
    if (iconeElement) {
        iconeElement.className = `fas fa-${icone} me-1`;
    }
    
    // Mostrar a badge
    badge.classList.remove('d-none');
    
    // Adicionar evento de clique para exibir mais informações
    badge.style.cursor = 'pointer';
    badge.title = 'Clique para mais informações';
    
    // Remover qualquer listener anterior para evitar duplicação
    const newBadge = badge.cloneNode(true);
    badge.parentNode.replaceChild(newBadge, badge);
    
    newBadge.addEventListener('click', () => {
        Swal.fire({
            title: 'Informações sobre os dados',
            html: `
                <div class="text-start">
                    <p>Status atual: <strong>${texto}</strong></p>
                    ${fonte === 'cache' ? `
                        <p>Os dados estão sendo exibidos do cache local para melhorar o desempenho e reduzir o tráfego com o Firebase.</p>
                        <p>Última atualização: <strong>${tempoAtras}</strong></p>
                    ` : ''}
                    ${fonte === 'firebase' ? `
                        <p>Os dados foram carregados diretamente do Firebase e estão atualizados.</p>
                    ` : ''}
                    ${fonte === 'atualizado' ? `
                        <p>Os dados foram inicialmente carregados do cache e depois atualizados com dados do Firebase.</p>
                    ` : ''}
                    ${fonte === 'erro' ? `
                        <p class="text-danger">Ocorreu um erro ao carregar os dados do Firebase. Os dados exibidos podem estar desatualizados.</p>
                    ` : ''}
                    <hr>
                    <p class="mt-3">Ações disponíveis:</p>
                    <ul>
                        <li>Clique em "Atualizar agora" para recarregar os dados do Firebase</li>
                        <li>Clique em "Limpar cache" para remover os dados em cache</li>
                    </ul>
                </div>
            `,
            icon: fonte === 'erro' ? 'error' : 'info',
            showCancelButton: true,
            confirmButtonText: 'Atualizar agora',
            cancelButtonText: 'Limpar cache',
            showDenyButton: true,
            denyButtonText: 'Fechar',
            confirmButtonColor: '#0d6efd',
            cancelButtonColor: '#dc3545',
            denyButtonColor: '#6c757d'
        }).then((result) => {
            if (result.isConfirmed) {
                // Atualizar dados do Firebase
                window.location.reload();
            } else if (result.dismiss === Swal.DismissReason.cancel) {
                // Limpar cache
                try {
                    localStorage.removeItem(CACHE_KEY_LOJAS);
                    localStorage.removeItem(CACHE_KEY_TIMESTAMP);
                    Swal.fire({
                        icon: 'success',
                        title: 'Cache limpo',
                        text: 'Os dados serão recarregados do Firebase na próxima visita.',
                        confirmButtonColor: '#0d6efd'
                    }).then(() => {
                        // Recarregar a página para atualizar os dados
                        window.location.reload();
                    });
                } catch (error) {
                    console.error("Erro ao limpar cache:", error);
                    Swal.fire({
                        icon: 'error',
                        title: 'Erro',
                        text: 'Não foi possível limpar o cache: ' + error.message,
                        confirmButtonColor: '#0d6efd'
                    });
                }
            }
        });
    });
}

// 3. Função de ordenação:
function ordenarPorOffline(colIdx) {
    const tbody = document.getElementById('lojas-table-body');
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll('tr'));
    rows.sort((a, b) => {
        const aVal = parseInt(a.querySelector('.loja-equipamentos')?.getAttribute('data-offline') || '0', 10);
        const bVal = parseInt(b.querySelector('.loja-equipamentos')?.getAttribute('data-offline') || '0', 10);
        return bVal - aVal;
    });
    rows.forEach(row => tbody.appendChild(row));
}



