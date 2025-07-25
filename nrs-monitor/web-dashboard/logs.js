// Elementos do DOM
const btnRecarregarTabela = document.getElementById('btnRecarregarTabela');
const btnAplicarFiltros = document.getElementById('btnAplicarFiltros');
const btnLimparFiltros = document.getElementById('btnLimparFiltros');
const filtroLoja = document.getElementById('filtroLoja');
const filtroOperacao = document.getElementById('filtroOperacao');
const filtroMaquina = document.getElementById('filtroMaquina');
const dataDe = document.getElementById('dataDe');
const dataAte = document.getElementById('dataAte');

// Constantes para o cache
const CACHE_KEY_LOGS = 'cached_logs_data';
const CACHE_KEY_LOGS_TIMESTAMP = 'cached_logs_timestamp';
const CACHE_EXPIRY_TIME = 30 * 60 * 1000; // 30 minutos em milissegundos
const FILTROS_LOGS_KEY = 'saved_logs_filters';
const CACHE_KEY_STATUS_MACHINE = 'cached_status_machine_data';
const CACHE_KEY_STATUS_MACHINE_TIMESTAMP = 'cached_status_machine_timestamp';

// Referência à coleção no Firestore
const operacoesRef = firebase.firestore().collection('operacoes_logs');

// Variáveis globais
let dataTable;
let equipamentos = [];
let usuarios = []; 
let colecaoRegistros = 'operacoes_logs'; // Nome da coleção principal
let todasLojas = new Set(); // Para armazenar lojas únicas
let todasMaquinas = new Set(); // Para armazenar máquinas únicas
let dadosOriginais = []; // Armazenar todos os registros sem filtro

// Cache de registros para mostrar detalhes
let registrosCache = {};

// Verificar se não encontramos dados úteis, tente recarregar
let tentativasRecarregamento = 0;
const MAX_TENTATIVAS = 3;

// Variáveis globais para o modal de status_machine
let statusMachineModal = null;
let machineStatusDetailModal = null;
let statusMachineData = [];
let filteredStatusMachineData = [];
let lojasComStatus = new Set();

// Function to hide the loading spinner
function hideLoadingSpinner() {
    console.log('Attempting to hide loading spinner');
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
        console.log('Loading spinner hidden successfully');
    } else {
        console.error('Loading overlay element not found');
    }
}

// Função para inicializar a página
function inicializarPagina() {
    console.log('Inicializando página de logs...');
    
    // Verificar se a configuração Firebase está ok
    if (!firebase.apps.length) {
        console.error('Firebase não inicializado!');
        alert('Erro: Firebase não inicializado corretamente.');
        hideLoadingSpinner();
        return;
    }
    
    // Garantir que o spinner de carregamento esteja visível
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        loadingOverlay.style.display = 'flex';
    }
    
    // Inicializar componentes da página
    carregarEquipamentos();
    carregarUsuarios();
    configurarTabela();
    configurarFiltros();
    
    // Monitorar coleções para registros recentes
    monitorarColecoes();
    
    // Carregar registros iniciais
    buscarRegistros();
    
    // Definir um tempo limite para esconder o spinner de qualquer maneira
    setTimeout(hideLoadingSpinner, 5000);
}

// Configurar eventos dos filtros
function configurarFiltros() {
    console.log('Configurando filtros...');
    
    // Verificar se os elementos existem
    const btnAplicarFiltros = document.getElementById('btnAplicarFiltros');
    const btnLimparFiltros = document.getElementById('btnLimparFiltros');
    const btnExportCsv = document.getElementById('btnExportCsv');
    const btnExportExcel = document.getElementById('btnExportExcel');
    const btnExportPdf = document.getElementById('btnExportPdf');
    const btnExportPrint = document.getElementById('btnExportPrint');
    const filtroPesquisa = document.getElementById('filtroPesquisa');
    const btnPesquisar = document.getElementById('btnPesquisar');
    
    if (!btnAplicarFiltros || !btnLimparFiltros) {
        console.error('Elementos de botões de filtro não encontrados!');
        return;
    }
    
    console.log('Botões de filtro encontrados, configurando eventos...');
    
    // Evento de aplicar filtros
    btnAplicarFiltros.addEventListener('click', function() {
        console.log('Botão Aplicar Filtros clicado');
        aplicarFiltros();
    });
    
    // Evento de limpar filtros
    btnLimparFiltros.addEventListener('click', function() {
        console.log('Botão Limpar Filtros clicado');
        limparFiltros();
    });
    
    // Configurar campo de pesquisa personalizado
    if (filtroPesquisa && btnPesquisar) {
        console.log('Configurando campo de pesquisa personalizado');
        
        // Evento de clique no botão de pesquisa
        btnPesquisar.addEventListener('click', function() {
            const termoPesquisa = filtroPesquisa.value.trim();
            console.log(`Aplicando pesquisa: "${termoPesquisa}"`);
            dataTable.search(termoPesquisa).draw();
        });
        
        // Evento de pressionar Enter no campo de pesquisa
        filtroPesquisa.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                const termoPesquisa = filtroPesquisa.value.trim();
                console.log(`Aplicando pesquisa (via Enter): "${termoPesquisa}"`);
                dataTable.search(termoPesquisa).draw();
            }
        });
    }
    
    // Configurar botões de exportação
    if (btnExportCsv) {
        btnExportCsv.addEventListener('click', function() {
            // Usar o método correto para acionar a exportação CSV
            var exportButton = dataTable.button('.buttons-csv');
            exportButton.trigger();
        });
    }
    
    if (btnExportExcel) {
        btnExportExcel.addEventListener('click', function() {
            // Usar o método correto para acionar a exportação Excel
            var exportButton = dataTable.button('.buttons-excel');
            exportButton.trigger();
        });
    }
    
    if (btnExportPdf) {
        btnExportPdf.addEventListener('click', function() {
            // Usar o método correto para acionar a exportação PDF
            var exportButton = dataTable.button('.buttons-pdf');
            exportButton.trigger();
        });
    }
    
    if (btnExportPrint) {
        btnExportPrint.addEventListener('click', function() {
            // Usar o método correto para acionar a exportação de impressão
            var exportButton = dataTable.button('.buttons-print');
            exportButton.trigger();
        });
    }
    
    console.log('Eventos dos botões de filtro configurados com sucesso');
}

// Popular seletores de filtro com dados disponíveis
function popularSeletoresFiltro() {
    console.log('Populando seletores de filtro...');
    console.log(`Valores únicos encontrados: ${todasLojas.size} lojas, ${todasMaquinas.size} máquinas`);
    
    // Remover valores vazios, nulos ou undefined
    todasLojas.delete('');
    todasLojas.delete(null);
    todasLojas.delete(undefined);
    
    todasMaquinas.delete('');
    todasMaquinas.delete(null);
    todasMaquinas.delete(undefined);
    
    // Popular seletor de lojas
    filtroLoja.innerHTML = '<option value="">Todas as Lojas</option>';
    [...todasLojas].sort().forEach(loja => {
        const option = document.createElement('option');
        option.value = loja;
        option.textContent = loja;
        filtroLoja.appendChild(option);
    });
    
    console.log(`Adicionadas ${filtroLoja.options.length - 1} opções ao filtro de lojas`);
    
    // Popular seletor de máquinas
    filtroMaquina.innerHTML = '<option value="">Todas as Máquinas</option>';
    [...todasMaquinas].sort().forEach(maquina => {
        const option = document.createElement('option');
        option.value = maquina;
        option.textContent = maquina;
        filtroMaquina.appendChild(option);
    });
    
    console.log(`Adicionadas ${filtroMaquina.options.length - 1} opções ao filtro de máquinas`);
}

// Função para normalizar um timestamp em diversos formatos para um objeto Date
function normalizarTimestamp(timestamp) {
    if (!timestamp) return null;
    
    // Se já for um Date, retorna ele mesmo
    if (timestamp instanceof Date) {
        return timestamp;
    }
    
    // Se for um timestamp do Firestore
    if (typeof timestamp === 'object' && timestamp.seconds !== undefined) {
        return new Date(timestamp.seconds * 1000 + (timestamp.nanoseconds || 0) / 1000000);
    }
    
    // Se for uma string ISO ou timestamp numérico
    if (typeof timestamp === 'string' || typeof timestamp === 'number') {
        const data = new Date(timestamp);
        if (!isNaN(data.getTime())) {
            return data;
        }
    }
    
    console.warn("Formato de timestamp não reconhecido:", timestamp);
    return null;
}

// Aplicar filtros à tabela
function aplicarFiltros() {
    console.log("Aplicando filtros...");
    
    // Mostrar o spinner de carregamento
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        loadingOverlay.style.display = 'flex';
    }
    
    // Verificar se dadosOriginais existe e tem registros
    if (!dadosOriginais || dadosOriginais.length === 0) {
        console.error("Dados originais não disponíveis ou vazios");
        alert("Não há dados para filtrar. Tente recarregar a página.");
        // Esconder o spinner em caso de erro
        hideLoadingSpinner();
        return;
    }
    
    // Obter os valores selecionados dos filtros - verificando se os elementos existem
    const filtroOperacao = document.getElementById('filtroOperacao');
    const filtroLoja = document.getElementById('filtroLoja');
    const filtroMaquina = document.getElementById('filtroMaquina');
    const filtroData = document.getElementById('filtroData');
    
    if (!filtroOperacao || !filtroLoja || !filtroMaquina) {
        console.error("Elementos de filtro não encontrados!");
        alert("Erro ao aplicar filtros. Elementos não encontrados.");
        // Esconder o spinner em caso de erro
        hideLoadingSpinner();
        return;
    }
    
    const operacaoSelecionada = filtroOperacao.value;
    const lojaSelecionada = filtroLoja.value;
    const maquinaSelecionada = filtroMaquina.value;
    
    // Obter valor da data se o elemento existir
    const dataStr = filtroData ? filtroData.value : '';
    
    console.log(`Filtros selecionados: 
    - Operação: ${operacaoSelecionada} 
    - Loja: ${lojaSelecionada} 
    - Máquina: ${maquinaSelecionada}
    - Data: ${dataStr}`);
    
    // Converter string de data para objeto Date
    let dataFiltro = null;
    let diaFiltro = null;
    let mesFiltro = null;
    let anoFiltro = null;

    if (dataStr) {
        // Obter os componentes da data a partir da string no formato YYYY-MM-DD
        const [ano, mes, dia] = dataStr.split('-').map(Number);
        
        // Armazenar componentes da data para uso na filtragem
        diaFiltro = dia;
        mesFiltro = mes;
        anoFiltro = ano;
        
        // Componentes de data obtidos diretamente da string, sem conversão para Date
        // para evitar problemas de fuso horário
        console.log(`Data selecionada no filtro: ${dia}/${mes}/${ano}`);
    }

    console.log(`Iniciando filtragem de ${dadosOriginais.length} registros...`);
    
    // Filtrar os registros usando dadosOriginais
    const filtrados = dadosOriginais.filter(registro => {
        // Filtro por operação
        if (operacaoSelecionada && operacaoSelecionada !== "") {
            // Extrair todos os possíveis valores de operação do registro
            const camposOperacao = [
                registro.operacao,
                registro.tipo,
                registro.type,
                registro.tipoOperacao,
                registro.dados?.tipo,
                registro.dados?.operacao,
                registro.configuracao?.tipo,
                registro.configuracao?.operacao
            ];
            
            // Verificar strings com possíveis prefixos
            for (const key in registro) {
                if (key.includes('tipo') || key.includes('operacao') || key.includes('type')) {
                    camposOperacao.push(registro[key]);
                }
            }
            
            // Filtrar valores undefined/null e converter para strings para comparação
            const valoresOperacao = camposOperacao
                .filter(valor => valor !== undefined && valor !== null)
                .map(valor => {
                    if (typeof valor === 'object') {
                        return (valor.tipo || valor.name || '').toString().toLowerCase();
                    }
                    return valor.toString().toLowerCase();
                });
            
            // Normalizar a operação selecionada para comparação
            const operacaoNormalizada = normalizarTipoOperacao(operacaoSelecionada).toLowerCase();
            
            console.log(`Comparando operação: "${operacaoSelecionada}" (normalizada: "${operacaoNormalizada}") com valores encontrados:`, valoresOperacao);
            
            // Verificar se a operação normalizada está em algum dos campos
            const operacaoEncontrada = valoresOperacao.some(valor => {
                // Normalizar o valor do registro também
                const valorNormalizado = normalizarTipoOperacao(valor).toLowerCase();
                console.log(`  Comparando: "${valorNormalizado}" com "${operacaoNormalizada}"`);
                return valorNormalizado === operacaoNormalizada;
            });
            
            if (!operacaoEncontrada) {
                return false;
            }
        }
        
        // Filtro por loja
        if (lojaSelecionada && lojaSelecionada !== "") {
            const lojaRegistro = registro.loja || registro.deviceData?.store || registro.store || '';
            console.log(`Comparando loja: "${lojaSelecionada}" com "${lojaRegistro}"`);
            
            // Evitar erro ao chamar toString em null ou undefined
            const lojaStr = lojaRegistro ? lojaRegistro.toString().toLowerCase() : '';
            if (lojaStr !== lojaSelecionada.toLowerCase()) {
                return false;
            }
        }
        
        // Filtro por máquina
        if (maquinaSelecionada && maquinaSelecionada !== "") {
            // Extrair todos os possíveis valores de máquina do registro
            const camposMaquina = [
                registro.maquina,
                registro.machine,
                registro.maquinaId,
                registro.machineId,
                registro.lavadoraId,
                registro.secadoraId,
                registro.dosadoraId,
                registro.dispositivo,
                registro.equipamentoId,
                registro.deviceData?.machine,
                registro.dados?.maquina,
                registro.dados?.machine,
                registro.configuracao?.maquina,
                registro.configuracao?.machine
            ];
            
            // Verificar se o registro tem o campo 'configuracao'
            if (registro.configuracao) {
                camposMaquina.push(registro.configuracao.lavadoraId);
                camposMaquina.push(registro.configuracao.secadoraId);
                camposMaquina.push(registro.configuracao.dosadoraId);
            }
            
            // Verificar se o registro tem o campo 'dados'
            if (registro.dados) {
                camposMaquina.push(registro.dados.lavadoraId);
                camposMaquina.push(registro.dados.secadoraId);
                camposMaquina.push(registro.dados.dosadoraId);
            }
            
            // Filtrar valores undefined/null e converter para strings para comparação
            const valoresMaquina = camposMaquina
                .filter(valor => valor !== undefined && valor !== null)
                .map(valor => {
                    if (typeof valor === 'object') {
                        return (valor.id || valor.codigo || '').toString().toLowerCase();
                    }
                    return valor.toString().toLowerCase();
                });
            
            console.log(`Comparando máquina: "${maquinaSelecionada}" com valores encontrados:`, valoresMaquina);
            
            // Se não encontrarmos a máquina em nenhum dos campos, retornar false
            if (!valoresMaquina.includes(maquinaSelecionada.toLowerCase())) {
                return false;
            }
        }
        
        // Filtro por data única
        if (diaFiltro && mesFiltro && anoFiltro) {
            // Normalizar o timestamp do registro
            const registroTimestamp = normalizarTimestamp(registro.timestamp);
            
            if (!registroTimestamp) {
                console.log(`Registro sem timestamp válido:`, registro);
                return false;
            }
            
            // Extrair dia, mês e ano diretamente do objeto Date do registro
            const diaRegistro = registroTimestamp.getDate();
            const mesRegistro = registroTimestamp.getMonth() + 1; // getMonth() retorna 0-11
            const anoRegistro = registroTimestamp.getFullYear();
            
            console.log(`Comparando datas: ${diaFiltro}/${mesFiltro}/${anoFiltro} com ${diaRegistro}/${mesRegistro}/${anoRegistro}`);
            
            // Verificar se o dia, mês e ano são iguais
            if (diaRegistro !== diaFiltro || mesRegistro !== mesFiltro || anoRegistro !== anoFiltro) {
                return false;
            }
        }
        
        // Se passou por todos os filtros, retorna true
        return true;
    });
    
    console.log(`Registros filtrados: ${filtrados.length} de ${dadosOriginais.length}`);
    
    // Atualizar a exibição com os registros filtrados
    renderizarRegistros(filtrados);
}

// Normalizar tipos de operação para padronizar a filtragem
function normalizarTipoOperacao(tipo) {
    if (!tipo) return '';
    
    // Converter para string para garantir que possamos usar métodos de string
    tipo = String(tipo).toLowerCase().trim();
    
    // Liberação de Lavadora - vários formatos possíveis
    if (tipo.includes('lavadora') || 
        tipo.includes('wash') || 
        tipo === 'wash' || 
        tipo === 'lavagem' || 
        tipo === 'liberacao_lavadora' || 
        tipo === 'liberação_lavadora' || 
        tipo === 'liberacao lavadora' || 
        tipo === 'washing' || 
        tipo === 'wash_cycle' ||
        tipo === 'liberacao lavadora') {
        return 'Lavadora';
    } 
    // Liberação de Secadora - vários formatos possíveis
    else if (tipo.includes('secadora') || 
             tipo.includes('dry') || 
             tipo === 'dry' || 
             tipo === 'secagem' || 
             tipo === 'liberacao_secadora' || 
             tipo === 'liberação_secadora' || 
             tipo === 'liberacao secadora' || 
             tipo === 'drying' || 
             tipo === 'dry_cycle' ||
             tipo === 'liberacao secadora') {
        return 'Secadora';
    } 
    // Acionamento de Dosadora - vários formatos possíveis
    else if (tipo.includes('dosadora') || 
             tipo.includes('dose') || 
             tipo === 'dose' || 
             tipo === 'dosagem' || 
             tipo === 'acionamento_dosadora' || 
             tipo === 'acionamento dosadora' || 
             tipo === 'dosing' || 
             tipo === 'detergent' ||
             tipo === 'acionamento dosadora') {
        return 'Dosadora';
    } 
    // Reset - formatos possíveis
    else if (tipo.includes('reset') || 
             tipo === 'reset' || 
             tipo === 'restart' || 
             tipo === 'reiniciar') {
        return 'Reset';
    } 
    // Login - formatos possíveis
    else if (tipo.includes('login') || 
             tipo === 'login' || 
             tipo === 'logon' || 
             tipo === 'signin') {
        return 'Login';
    } 
    // Logout - formatos possíveis
    else if (tipo.includes('logout') || 
             tipo === 'logout' || 
             tipo === 'logoff' || 
             tipo === 'signout') {
        return 'Logout';
    }
    
    // Se não corresponder a nenhum padrão conhecido, retorna o tipo original
    return tipo;
}

// Limpar todos os filtros
function limparFiltros() {
    console.log('Limpando filtros...');
    
    // Mostrar o spinner de carregamento
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        loadingOverlay.style.display = 'flex';
    }
    
    // Obter referências aos elementos de filtro
    const filtroOperacao = document.getElementById('filtroOperacao');
    const filtroLoja = document.getElementById('filtroLoja');
    const filtroMaquina = document.getElementById('filtroMaquina');
    const filtroData = document.getElementById('filtroData');
    const filtroPesquisa = document.getElementById('filtroPesquisa');
    
    // Restaurar valores padrão se os elementos existirem
    if (filtroOperacao) filtroOperacao.value = '';
    if (filtroLoja) filtroLoja.value = '';
    if (filtroMaquina) filtroMaquina.value = '';
    if (filtroData) filtroData.value = '';
    if (filtroPesquisa) filtroPesquisa.value = '';
    
    // Limpar a pesquisa do DataTable
    if (dataTable) {
        dataTable.search('').draw();
    }
    
    // Recarregar todos os registros na tabela
    renderizarRegistros(dadosOriginais);
    
    console.log('Filtros limpos, exibindo todos os registros');
}

// Monitorar coleções para novos registros
function monitorarColecoes() {
    console.log('Monitorando coleções para novos registros...');
    
    // Monitorar a coleção de operações_logs para novas entradas
    const unsubscribe = firebase.firestore().collection('operacoes_logs')
        .orderBy('timestamp', 'desc')
        .limit(5)
        .onSnapshot(snapshot => {
            // Verificar se temos alterações
            if (!snapshot.empty && snapshot.docChanges().length > 0) {
                console.log('Novos registros ou alterações detectadas:', snapshot.docChanges().length);
                
                let novoRegistroEncontrado = false;
                
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        novoRegistroEncontrado = true;
                        const dados = change.doc.data();
                        console.log('Novo registro adicionado:', change.doc.id);
                        
                        // Verificar e possivelmente criar dados de equipamento
                        verificarOuCriarEquipamento(dados);
                        
                        // Verificar e possivelmente criar dados de usuário
                        verificarOuCriarUsuario(dados);
                    }
                });
                
                // Recarregar a tabela para mostrar os novos registros
                if (novoRegistroEncontrado) {
                    setTimeout(() => {
                        console.log('Recarregando tabela para mostrar novos registros...');
                        buscarRegistros();
                    }, 1000);
                }
            }
        }, error => {
            console.error('Erro ao monitorar coleção:', error);
        });
        
    // Registrar o unsubscribe para limpar quando necessário
    window.unsubscribeMonitor = unsubscribe;
}

// Verificar se o equipamento existe, caso contrário criar
function verificarOuCriarEquipamento(dados) {
    const idEquipamento = dados.dispositivo || dados.equipamentoId;
    
    if (!idEquipamento) {
        console.log('Não foi possível identificar o ID do equipamento');
        return;
    }
    
    console.log(`Verificando se equipamento ${idEquipamento} existe...`);
    
    // Verificar na coleção de equipamentos
    firebase.firestore().collection('equipamentos')
        .doc(idEquipamento)
        .get()
        .then(doc => {
            if (doc.exists) {
                console.log(`Equipamento ${idEquipamento} já existe:`, doc.data());
            } else {
                console.log(`Equipamento ${idEquipamento} não encontrado, criando novo...`);
                
                // Criar novo equipamento
                const novoEquipamento = {
                    nome: `Dispositivo ${idEquipamento}`,
                    tipo: dados.tipo === 'secadora' || dados.tipo === 'liberacao_secadora' || dados.tipo === 'DRY' ? 'secadora' : 
                          dados.tipo === 'lavadora' || dados.tipo === 'liberacao_lavadora' || dados.tipo === 'WASH' ? 'lavadora' : 
                          dados.tipo === 'dosadora' || dados.tipo === 'acionamento_dosadora' || dados.tipo === 'DOSE' ? 'dosadora' : 'desconhecido',
                    status: 'ativo',
                    dataCriacao: firebase.firestore.FieldValue.serverTimestamp(),
                    ultimaAtualizacao: firebase.firestore.FieldValue.serverTimestamp()
                };
                
                // Salvar no Firestore
                firebase.firestore().collection('equipamentos')
                    .doc(idEquipamento)
                    .set(novoEquipamento)
                    .then(() => {
                        console.log(`Equipamento ${idEquipamento} criado com sucesso:`, novoEquipamento);
                        // Atualizar a lista de equipamentos
                        carregarEquipamentos();
                    })
                    .catch(erro => {
                        console.error(`Erro ao criar equipamento ${idEquipamento}:`, erro);
                    });
            }
        })
        .catch(erro => {
            console.error(`Erro ao verificar equipamento ${idEquipamento}:`, erro);
        });
}

// Verificar se o usuário existe, caso contrário criar
function verificarOuCriarUsuario(dados) {
    const idUsuario = dados.usuario || dados.usuarioId;
    
    if (!idUsuario) {
        console.log('Não foi possível identificar o ID do usuário');
        return;
    }
    
    console.log(`Verificando se usuário ${idUsuario} existe...`);
    
    // Verificar na coleção de usuários
    firebase.firestore().collection('usuarios')
        .doc(idUsuario)
        .get()
        .then(doc => {
            if (doc.exists) {
                console.log(`Usuário ${idUsuario} já existe:`, doc.data());
            } else {
                console.log(`Usuário ${idUsuario} não encontrado, criando novo...`);
                
                // Criar novo usuário
                const novoUsuario = {
                    nome: `Usuário ${idUsuario}`,
                    email: `usuario-${idUsuario}@exemplo.com`,
                    tipo: 'operador',
                    status: 'ativo',
                    dataCriacao: firebase.firestore.FieldValue.serverTimestamp(),
                    ultimaAtualizacao: firebase.firestore.FieldValue.serverTimestamp()
                };
                
                // Salvar no Firestore
                firebase.firestore().collection('usuarios')
                    .doc(idUsuario)
                    .set(novoUsuario)
                    .then(() => {
                        console.log(`Usuário ${idUsuario} criado com sucesso:`, novoUsuario);
                        // Atualizar a lista de usuários
                        carregarUsuarios();
                    })
                    .catch(erro => {
                        console.error(`Erro ao criar usuário ${idUsuario}:`, erro);
                    });
            }
        })
        .catch(erro => {
            console.error(`Erro ao verificar usuário ${idUsuario}:`, erro);
        });
}

// Carregar equipamentos
function carregarEquipamentos() {
    console.log('Carregando lista de equipamentos...');
    
    firebase.firestore().collection('equipamentos')
        .get()
        .then(snapshot => {
            if (!snapshot.empty) {
                equipamentos = snapshot.docs.map(doc => {
                    return {
                    id: doc.id,
                        ...doc.data()
                    };
                });
                
                console.log(`${equipamentos.length} equipamentos carregados`);
            } else {
                console.log('Nenhum equipamento encontrado, tentando buscar de operações');
                buscarDispositivosOperacoesLogs();
            }
        })
        .catch(error => {
            console.error('Erro ao carregar equipamentos:', error);
            buscarDispositivosOperacoesLogs();
        });
        
    // Função para buscar dispositivos a partir de registros de operações
    function buscarDispositivosOperacoesLogs() {
        firebase.firestore().collection('operacoes_logs')
            .limit(100)
            .get()
            .then(snapshot => {
                if (!snapshot.empty) {
                    const dispositivosUnicos = new Set();
                
                    snapshot.docs.forEach(doc => {
                    const dados = doc.data();
                        const idDispositivo = dados.dispositivo || dados.equipamentoId;
                        
                        if (idDispositivo) {
                            dispositivosUnicos.add(idDispositivo);
                        }
                    });
                    
                    console.log(`Encontrados ${dispositivosUnicos.size} dispositivos únicos em operações`);
                } else {
                    console.log('Nenhum registro de operação encontrado para extrair dispositivos');
                }
            })
            .catch(error => {
                console.error('Erro ao buscar dispositivos de operações:', error);
            });
    }
}

// Carregar usuários
function carregarUsuarios() {
    console.log('Carregando lista de usuários...');
    
    firebase.firestore().collection('usuarios')
        .get()
        .then(snapshot => {
            if (!snapshot.empty) {
                usuarios = snapshot.docs.map(doc => {
                    return {
                    id: doc.id,
                        ...doc.data()
                    };
                });
                
                console.log(`${usuarios.length} usuários carregados`);
            } else {
                console.log('Nenhum usuário encontrado, tentando buscar de operações');
                buscarUsuariosOperacoesLogs();
            }
        })
        .catch(error => {
            console.error('Erro ao carregar usuários:', error);
            buscarUsuariosOperacoesLogs();
        });
        
    // Função para buscar usuários a partir de registros de operações
    function buscarUsuariosOperacoesLogs() {
        firebase.firestore().collection('operacoes_logs')
            .limit(100)
            .get()
            .then(snapshot => {
                if (!snapshot.empty) {
                    const usuariosUnicos = new Set();
                    
                    snapshot.docs.forEach(doc => {
                    const dados = doc.data();
                        const idUsuario = dados.usuario || dados.usuarioId;
                        
                        if (idUsuario) {
                            usuariosUnicos.add(idUsuario);
                        }
                    });
                    
                    console.log(`Encontrados ${usuariosUnicos.size} usuários únicos em operações`);
                } else {
                    console.log('Nenhum registro de operação encontrado para extrair usuários');
                }
            })
            .catch(error => {
                console.error('Erro ao buscar usuários de operações:', error);
            });
    }
}

// Gerar badge para tipo de operação
function gerarBadgeOperacao(tipo) {
    if (!tipo) return 'N/A';
    
    // Processar o tipo para uma versão normalizada
    const tipoNormalizado = String(tipo).toUpperCase();
    
    // Definir a classe baseada no tipo de operação
    let classe = '';
    let textoExibicao = '';
    
    if (tipoNormalizado.includes('WASH') || 
        tipoNormalizado.includes('LAVADORA') || 
        tipoNormalizado.includes('LAVAGEM') ||
        tipoNormalizado.includes('LIBERACAO_LAVADORA')) {
        classe = 'badge-primary';
        textoExibicao = 'Lavadora';
    } else if (tipoNormalizado.includes('DRY') || 
             tipoNormalizado.includes('SECADORA') || 
             tipoNormalizado.includes('SECAGEM') ||
             tipoNormalizado.includes('LIBERACAO_SECADORA')) {
        classe = 'badge-warning';
        textoExibicao = 'Secadora';
    } else if (tipoNormalizado.includes('DOSE') || 
             tipoNormalizado.includes('DOSADORA') || 
             tipoNormalizado.includes('DETERGENT') ||
             tipoNormalizado.includes('ACIONAMENTO') ||
             tipoNormalizado.includes('ACIONAMENTO_DOSADORA')) {
        classe = 'badge-info';
        textoExibicao = 'Dosadora';
    } else if (tipoNormalizado.includes('RESET')) {
        classe = 'badge-danger';
        textoExibicao = 'Reset';
    } else if (tipoNormalizado.includes('LOGIN')) {
        classe = 'badge-success';
        textoExibicao = 'Login';
    } else if (tipoNormalizado.includes('LOGOUT')) {
        classe = 'badge-secondary';
        textoExibicao = 'Logout';
    } else {
        classe = 'badge-secondary';
        textoExibicao = tipo;
    }
    
    return `<span class="badge ${classe}">${textoExibicao}</span>`;
}

// Configurar a tabela DataTable
function configurarTabela() {
    console.log('Configurando tabela de registros...');
    
    const tabelaElement = document.getElementById('logsTable');
    
    if (!tabelaElement) {
        console.error('Elemento da tabela não encontrado!');
        return;
    }
    
    try {
        // Adicionar método de ordenação personalizado para datas no formato brasileiro
        $.extend($.fn.dataTableExt.oSort, {
            "date-br-pre": function(a) {
                if (a === 'N/A' || a === '') return 0;
                const brDate = a.split('/');
                return new Date(brDate[2], brDate[1]-1, brDate[0]).getTime();
            },
            "date-br-asc": function(a, b) {
                return a - b;
            },
            "date-br-desc": function(a, b) {
                return b - a;
            }
        });
        
        // Inicializar o DataTable com opções
        dataTable = $(tabelaElement).DataTable({
            responsive: true,
            order: [[0, 'desc'], [1, 'desc']], // Ordenar por data e hora decrescente
            pageLength: 10, // Definido para 10 registros por página
            lengthMenu: [10, 25, 50, 100], // Opções de quantidade por página
            language: {
                url: 'https://cdn.datatables.net/plug-ins/1.10.24/i18n/Portuguese-Brasil.json'
            },
            dom: 'Brtip', // Adicionado 'B' para os botões de exportação
            scrollX: false, // Desativa rolagem horizontal
            autoWidth: true, // Ajusta automaticamente a largura das colunas
            "ordering": true, // Habilitar ordenação
            "orderCellsTop": true, // Otimização de ordenação
            "orderClasses": false, // Desativar classes de ordenação para melhor desempenho
            buttons: [
                {
                    extend: 'csv',
                    text: 'CSV',
                    className: 'buttons-csv d-none',
                    exportOptions: { columns: ':visible' }
                },
                {
                    extend: 'excel',
                    text: 'Excel',
                    className: 'buttons-excel d-none',
                    exportOptions: { columns: ':visible' }
                },
                {
                    extend: 'pdf',
                    text: 'PDF',
                    className: 'buttons-pdf d-none',
                    exportOptions: { columns: ':visible' }
                },
                {
                    extend: 'print',
                    text: 'Imprimir',
                    className: 'buttons-print d-none',
                    exportOptions: { columns: ':visible' }
                }
            ],
            columnDefs: [
                { type: 'date-br', targets: 0 } // Aplicar ordenação de data brasileira à primeira coluna
            ],
            initComplete: function() {
                // Após a inicialização, carregar registros
                buscarRegistros();
            }
        });
        
        // Adicionar evento para clique nas linhas da tabela
        $('#logsTable tbody').on('click', 'tr', function() {
            const data = dataTable.row(this).data();
            if (data) {
                const dataHora = `${data[0]} ${data[1]}`;
                mostrarDetalhes(dataHora);
            }
        });
        
        console.log('Tabela inicializada com sucesso');
    } catch (erro) {
        console.error('Erro ao inicializar tabela:', erro);
    }
}

// Função para buscar registros de operações do Firestore
function buscarRegistros() {
    console.log('Buscando registros...');
    
    // Verificar primeiro se há dados no cache
    const dadosCache = carregarLogsDoCache();
    if (dadosCache) {
        console.log('Carregando registros do cache local...');
        // Processar os dados do cache
        dadosOriginais = dadosCache;
        
        // Extrair valores únicos para os filtros
        extrairValoresUnicosParaFiltros(dadosCache);
        
        // Popular os seletores de filtro
        popularSeletoresFiltro();
        
        // Processar e exibir os registros na tabela
        const registrosProcessados = processarRegistros(dadosCache);
        
        // Renderizar os registros
        renderizarRegistros(registrosProcessados);
        
        // Adicionar botão "Carregar Mais" se não existir
        adicionarBotaoCarregarMais();
        
        // Iniciar atualização em segundo plano
        setTimeout(() => {
            buscarRegistrosDoFirebase(true);
        }, 2000);
        
        return;
    }
    
    // Se não há cache ou está expirado, buscar do Firebase
    buscarRegistrosDoFirebase();
}

// Função para buscar registros diretamente do Firebase
function buscarRegistrosDoFirebase(atualizacaoEmSegundoPlano = false) {
    console.log('Buscando registros do Firebase...');
    
    if (!atualizacaoEmSegundoPlano) {
        // Mostrar loading apenas se não for atualização em segundo plano
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'flex';
        }
    }
    
    // Limpar as coleções de valores únicos para os filtros
    todasLojas.clear();
    todasMaquinas.clear();
    
    // Criar uma query base ordenada por timestamp decrescente e limitada a registros
    let query = firebase.firestore().collection(colecaoRegistros)
        .orderBy('timestamp', 'desc')
        .limit(10);  // Alterado para 10 registros
    
    // Executar a query
    query.get()
        .then(snapshot => {
            if (!snapshot.empty) {
                console.log(`Encontrados ${snapshot.size} registros`);
                
                // Processar os dados da query
                const registros = snapshot.docs.map(doc => {
                    const dados = doc.data();
                    dados.id = doc.id;
                    
                    // Armazenar no cache para uso posterior
                    registrosCache[doc.id] = dados;
                    
                    return dados;
                });
                
                // Armazenar todos os registros sem filtro
                dadosOriginais = registros;
                
                // Extrair valores únicos para os filtros
                extrairValoresUnicosParaFiltros(registros);
                
                // Popular os seletores de filtro
                popularSeletoresFiltro();
                
                // Processar e exibir os registros na tabela
                const registrosProcessados = processarRegistros(registros);
                
                // Renderizar os registros
                renderizarRegistros(registrosProcessados);
                
                tentativasRecarregamento = 0;
                
                // Adicionar botão "Carregar Mais" se não existir
                adicionarBotaoCarregarMais();
                
                // Salvar logs no cache local
                salvarLogsNoCache(registros);
                
                // Atualizar a indicação da fonte de dados
                if (!atualizacaoEmSegundoPlano) {
                    atualizarBadgeFonteDados('firebase');
                }
            } else {
                console.log('Nenhum registro encontrado');
                if (tentativasRecarregamento < MAX_TENTATIVAS) {
                    tentativasRecarregamento++;
                    setTimeout(() => buscarRegistrosDoFirebase(atualizacaoEmSegundoPlano), 1000);
                } else {
                    alert('Não foi possível encontrar registros de operações.');
                    if (!atualizacaoEmSegundoPlano) {
                        atualizarBadgeFonteDados('erro');
                    }
                }
            }
        })
        .catch(error => {
            console.error('Erro ao buscar registros:', error);
            if (!atualizacaoEmSegundoPlano) {
                alert(`Erro ao buscar registros: ${error.message}`);
                atualizarBadgeFonteDados('erro');
            }
        });
}

// Extrair valores únicos para os filtros
function extrairValoresUnicosParaFiltros(registros) {
                registros.forEach(registro => {
                    // Extrair todas as possíveis lojas
                    const lojasExtrair = [
                        registro.lojaId,
                        registro.storeId,
                        registro.loja,
                        registro.store
                    ];
                    
                    // Verificar campos aninhados
                    if (registro.dados) {
                        lojasExtrair.push(registro.dados.lojaId);
                        lojasExtrair.push(registro.dados.loja);
                        lojasExtrair.push(registro.dados.store);
                    }
                    
                    if (registro.configuracao) {
                        lojasExtrair.push(registro.configuracao.lojaId);
                        lojasExtrair.push(registro.configuracao.loja);
                    }
                    
                    // Para loja como objeto
                    if (typeof registro.store === 'object' && registro.store !== null) {
                        lojasExtrair.push(registro.store.id);
                        lojasExtrair.push(registro.store.name);
                    }
                    
                    // Adicionar valores válidos ao Set
                    lojasExtrair
                        .filter(item => item !== undefined && item !== null && item !== '')
                        .forEach(item => {
                            if (typeof item === 'object') {
                                // Para objetos, extrair propriedades úteis
                                if (item.id) todasLojas.add(item.id);
                                if (item.name) todasLojas.add(item.name);
            } else {
                                todasLojas.add(String(item));
                            }
                        });
                    
                    // Extrair todas as possíveis máquinas
                    const maquinasExtrair = [
                        registro.maquina,
                        registro.machine,
                        registro.maquinaId,
                        registro.machineId,
                        registro.lavadoraId,
                        registro.secadoraId,
                        registro.dosadoraId,
                        registro.dispositivo,
                        registro.equipamentoId,
                        registro.deviceData?.machine,
                        registro.dados?.maquina,
                        registro.dados?.machine,
                        registro.configuracao?.maquina,
                        registro.configuracao?.machine
                    ];
                    
                    // Verificar campos aninhados
                    if (registro.dados) {
                        maquinasExtrair.push(registro.dados.maquina);
                        maquinasExtrair.push(registro.dados.machine);
                    }
                    
                    // Para máquina como objeto
                    if (typeof registro.maquina === 'object' && registro.maquina !== null) {
                        maquinasExtrair.push(registro.maquina.id);
                        maquinasExtrair.push(registro.maquina.codigo);
                    }
                    
                    if (typeof registro.machine === 'object' && registro.machine !== null) {
                        maquinasExtrair.push(registro.machine.id);
                        maquinasExtrair.push(registro.machine.codigo);
                    }
                    
                    // Adicionar valores válidos ao Set
                    maquinasExtrair
                        .filter(item => item !== undefined && item !== null && item !== '')
                        .forEach(item => {
                            if (typeof item === 'object') {
                                // Para objetos, extrair propriedades úteis
                                if (item.id) todasMaquinas.add(item.id);
                                if (item.codigo) todasMaquinas.add(item.codigo);
                            } else {
                                todasMaquinas.add(String(item));
                            }
                        });
                });
                
                console.log(`Extraídos ${todasLojas.size} valores de loja e ${todasMaquinas.size} valores de máquina`);
}

// Função para salvar os logs no cache local
function salvarLogsNoCache(logs) {
    try {
        console.log(`Salvando ${logs.length} registros no cache local`);
        
        // Converter dados para um formato mais adequado para cache
        // Neste caso, precisamos converter objetos timestamp em objetos serializáveis
        const logsSerializaveis = logs.map(log => {
            const logSerializavel = { ...log };
                
            // Se for um timestamp do Firestore, converter para string ISO
            if (logSerializavel.timestamp && typeof logSerializavel.timestamp === 'object') {
                if (logSerializavel.timestamp.seconds) {
                    // Timestamp do Firestore
                    const data = new Date(logSerializavel.timestamp.seconds * 1000 + 
                                         (logSerializavel.timestamp.nanoseconds || 0) / 1000000);
                    logSerializavel.timestamp = data.toISOString();
                } else if (logSerializavel.timestamp instanceof Date) {
                    // Objeto Date
                    logSerializavel.timestamp = logSerializavel.timestamp.toISOString();
                }
            }
            
            return logSerializavel;
        });
        
        // Salvar os dados serializado no localStorage
        localStorage.setItem(CACHE_KEY_LOGS, JSON.stringify(logsSerializaveis));
        
        // Salvar o timestamp atual
        localStorage.setItem(CACHE_KEY_LOGS_TIMESTAMP, Date.now().toString());
        
        console.log('Registros salvos no cache com sucesso');
    } catch (error) {
        console.error('Erro ao salvar registros no cache:', error);
    }
}

// Função para carregar os logs do cache
function carregarLogsDoCache() {
    try {
        // Verificar se existe cache
        const cachedTimestamp = localStorage.getItem(CACHE_KEY_LOGS_TIMESTAMP);
        if (!cachedTimestamp) return null;
        
        // Verificar se o cache está expirado
        const timestamp = parseInt(cachedTimestamp);
        const agora = Date.now();
        if (agora - timestamp > CACHE_EXPIRY_TIME) {
            console.log('Cache de registros expirado, será recarregado do Firebase');
            return null;
        }
        
        // Carregar os dados dos registros
        const cachedLogs = localStorage.getItem(CACHE_KEY_LOGS);
        if (!cachedLogs) return null;
        
        // Converter os dados JSON para objeto
        const logs = JSON.parse(cachedLogs);
        
        // Converter timestamps de volta para objetos Date
        const logsProcessados = logs.map(log => {
            // Se o timestamp for string, converter para Date
            if (log.timestamp && typeof log.timestamp === 'string') {
                log.timestamp = new Date(log.timestamp);
            }
            return log;
        });
        
        console.log(`Carregados ${logsProcessados.length} registros do cache`);
                
        // Atualizar a indicação da fonte de dados
        const tempoDesdeAtualizacao = agora - timestamp;
        atualizarBadgeFonteDados('cache', tempoDesdeAtualizacao);
        
        return logsProcessados;
    } catch (error) {
        console.error('Erro ao carregar registros do cache:', error);
        return null;
    }
}

// Função para atualizar a badge de fonte de dados
function atualizarBadgeFonteDados(fonte) {
    // Obtém o elemento da badge e do texto
    const badgeElement = document.getElementById('data-source-badge');
    const textElement = document.getElementById('data-source-text');
    
    if (!badgeElement || !textElement) return;
    
    // Mostrar a badge (remove a classe d-none se estiver presente)
    badgeElement.classList.remove('d-none');
    
    // Atualiza classe e texto de acordo com a fonte
    if (fonte === 'cache') {
        badgeElement.className = 'badge bg-warning text-dark';
        textElement.textContent = 'Dados do Cache';
    } else if (fonte === 'firebase') {
        badgeElement.className = 'badge bg-primary text-white';
        textElement.textContent = 'Dados do Firebase';
    } else if (fonte === 'erro') {
        badgeElement.className = 'badge bg-danger text-white';
        textElement.textContent = 'Erro ao carregar dados';
    }
}

// Função para formatar o tempo relativo (quanto tempo atrás)
function formatarTempoRelativo(ms) {
    const segundos = Math.floor(ms / 1000);
    const minutos = Math.floor(segundos / 60);
    const horas = Math.floor(minutos / 60);
    
    if (horas > 0) {
        return `${horas}h atrás`;
    } else if (minutos > 0) {
        return `${minutos}min atrás`;
        } else {
        return `${segundos}s atrás`;
    }
}

// Função para salvar os filtros atuais no localStorage
function salvarFiltrosLogs() {
    try {
        // Obter os valores atuais dos filtros
        const filtros = {
            loja: filtroLoja ? filtroLoja.value : '',
            operacao: filtroOperacao ? filtroOperacao.value : '',
            maquina: filtroMaquina ? filtroMaquina.value : '',
            data: document.getElementById('filtroData') ? document.getElementById('filtroData').value : '',
            pesquisa: document.getElementById('filtroPesquisa') ? document.getElementById('filtroPesquisa').value : ''
        };
        
        // Salvar no localStorage
        localStorage.setItem(FILTROS_LOGS_KEY, JSON.stringify(filtros));
        console.log('Filtros de logs salvos:', filtros);
    } catch (error) {
        console.error('Erro ao salvar filtros de logs:', error);
    }
}

// Função para carregar os filtros salvos
function carregarFiltrosSalvosLogs() {
    try {
        const filtrosSalvos = localStorage.getItem(FILTROS_LOGS_KEY);
        if (!filtrosSalvos) return;
        
        const filtros = JSON.parse(filtrosSalvos);
        console.log('Filtros de logs carregados:', filtros);
        
        // Aplicar os filtros salvos aos elementos
        if (filtroLoja && filtros.loja) filtroLoja.value = filtros.loja;
        if (filtroOperacao && filtros.operacao) filtroOperacao.value = filtros.operacao;
        if (filtroMaquina && filtros.maquina) filtroMaquina.value = filtros.maquina;
        
        const filtroData = document.getElementById('filtroData');
        if (filtroData && filtros.data) filtroData.value = filtros.data;
        
        const filtroPesquisa = document.getElementById('filtroPesquisa');
        if (filtroPesquisa && filtros.pesquisa) {
            filtroPesquisa.value = filtros.pesquisa;
            if (dataTable) {
                dataTable.search(filtros.pesquisa).draw();
        }
    }
    } catch (error) {
        console.error('Erro ao carregar filtros de logs:', error);
    }
}

// Função para limpar o cache de logs
function limparCacheLogs() {
    try {
        localStorage.removeItem(CACHE_KEY_LOGS);
        localStorage.removeItem(CACHE_KEY_LOGS_TIMESTAMP);
        console.log('Cache de logs limpo com sucesso');
        
        // Recarregar os dados do Firebase
        buscarRegistrosDoFirebase();
        
        // Notificar o usuário
        Swal.fire({
            title: 'Cache Limpo',
            text: 'O cache de registros foi limpo com sucesso.',
            icon: 'success',
            confirmButtonText: 'OK'
        });
    } catch (error) {
        console.error('Erro ao limpar cache de logs:', error);
        
        Swal.fire({
            title: 'Erro',
            text: 'Ocorreu um erro ao limpar o cache de registros.',
            icon: 'error',
            confirmButtonText: 'OK'
        });
    }
}

// Função para adicionar botão "Carregar Mais"
function adicionarBotaoCarregarMais() {
    // Remover botão existente se houver
    const botaoExistente = document.getElementById('btnCarregarMais');
    if (botaoExistente) {
        botaoExistente.remove();
    }

    // Criar novo botão
    const div = document.createElement('div');
    div.className = 'text-center mt-3 mb-3';
    div.innerHTML = `
        <button id="btnCarregarMais" class="btn btn-outline-primary">
            <i class="fas fa-sync-alt me-1"></i>Carregar Mais Registros
        </button>
    `;

    // Adicionar após a tabela
    const tabela = document.getElementById('logsTable');
    tabela.parentNode.insertAdjacentElement('afterend', div);

    // Adicionar evento de clique
    document.getElementById('btnCarregarMais').addEventListener('click', carregarMaisRegistros);
}

// Função para carregar mais registros
function carregarMaisRegistros() {
    const ultimoRegistro = dadosOriginais[dadosOriginais.length - 1];
    if (!ultimoRegistro || !ultimoRegistro.timestamp) {
        console.error('Não foi possível determinar o último registro');
        return;
    }

    // Mostrar loading no botão
    const btnCarregarMais = document.getElementById('btnCarregarMais');
    const btnTextoOriginal = btnCarregarMais.innerHTML;
    btnCarregarMais.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Carregando...';
    btnCarregarMais.disabled = true;

    // Buscar próximos 10 registros
    firebase.firestore().collection(colecaoRegistros)
        .orderBy('timestamp', 'desc')
        .startAfter(ultimoRegistro.timestamp)
        .limit(10)
        .get()
        .then(snapshot => {
            if (!snapshot.empty) {
                const novosRegistros = snapshot.docs.map(doc => {
                    const dados = doc.data();
                    dados.id = doc.id;
                    registrosCache[doc.id] = dados;
                    return dados;
                });

                // Adicionar novos registros aos existentes
                dadosOriginais = [...dadosOriginais, ...novosRegistros];

                // Atualizar filtros e tabela
                novosRegistros.forEach(registro => {
                    if (registro.loja) todasLojas.add(registro.loja);
                    if (registro.store) todasLojas.add(registro.store);
                    if (registro.maquina) todasMaquinas.add(registro.maquina);
                    if (registro.machine) todasMaquinas.add(registro.machine);
                });

                popularSeletoresFiltro();
                const todosRegistrosProcessados = processarRegistros(dadosOriginais);
                renderizarRegistros(todosRegistrosProcessados);

                // Restaurar botão
                btnCarregarMais.innerHTML = btnTextoOriginal;
                btnCarregarMais.disabled = false;

                // Se não houver mais registros, remover o botão
                if (snapshot.size < 10) {
                    btnCarregarMais.remove();
                }
            } else {
                // Não há mais registros
                btnCarregarMais.remove();
            }
        })
        .catch(error => {
            console.error('Erro ao carregar mais registros:', error);
            btnCarregarMais.innerHTML = btnTextoOriginal;
            btnCarregarMais.disabled = false;
            alert('Erro ao carregar mais registros. Tente novamente.');
        });
}

// Função para eliminar registros duplicados
function eliminarDuplicados(registros) {
    console.log('Eliminando registros duplicados...');
    
    // Se houver poucos registros, não eliminar duplicatas
    if (registros.length <= 20) {
        console.log('Poucos registros encontrados, pulando eliminação de duplicatas');
        return registros;
    }
    
    // Usar um Map para agrupar registros por uma chave única
    const registrosMap = new Map();
    
    registros.forEach(registro => {
        // Criar uma chave mais específica para identificar duplicatas verdadeiras
        // Combinamos timestamp + dispositivo + tipo + machine/maquina + usuario
        
        let timestamp = '';
        if (registro.timestamp) {
            if (registro.timestamp instanceof Date) {
                timestamp = registro.timestamp.getTime();
            } else if (typeof registro.timestamp === 'object' && registro.timestamp.seconds) {
                timestamp = registro.timestamp.seconds * 1000;
        } else {
                timestamp = new Date(registro.timestamp).getTime();
            }
        }
        
        const dispositivo = registro.dispositivo || registro.equipamentoId || '';
        const tipo = registro.tipo || registro.type || '';
        const maquina = registro.maquina || registro.machine || '';
        const usuario = registro.usuario || registro.user || '';
        
        // Somente considerar duplicados se todos esses campos forem iguais
        // e a diferença de timestamp for menor que 1 segundo (1000ms)
        const chave = `${tipo}-${dispositivo}-${maquina}-${usuario}`;
        
        let adicionar = true;
        
        // Verificar se já existe um registro similar com timestamp próximo
        for (const [existingKey, existingReg] of registrosMap.entries()) {
            if (existingKey.startsWith(chave)) {
                const existingTime = existingReg._timestamp || 0;
                if (Math.abs(timestamp - existingTime) < 1000) {
                    // Registros são realmente duplicados, manter o mais completo
                    if (Object.keys(registro).length > Object.keys(existingReg).length) {
                        registrosMap.delete(existingKey);
                        adicionar = true;
                        break;
                    } else {
                        adicionar = false;
                        break;
                    }
                }
            }
        }
        
        if (adicionar) {
            // Armazenar o timestamp para comparação
            registro._timestamp = timestamp;
            registrosMap.set(`${chave}-${timestamp}`, registro);
        }
    });
    
    // Converter o Map de volta para um array
    return Array.from(registrosMap.values());
}

// Função para processar os registros antes de exibi-los
function processarRegistros(registros) {
    console.log(`Processando ${registros.length} registros...`);
    
    // Eliminar duplicatas baseado em algum critério
    const registrosUnicos = eliminarDuplicados(registros);
    console.log(`Registros após remoção de duplicatas: ${registrosUnicos.length}`);
    
    // Processar e normalizar os dados para exibição
    const registrosProcessados = registrosUnicos.map(registro => {
        // Normalizar timestamp usando a função robusta normalizarTimestamp
        if (registro.timestamp) {
            registro.timestamp = normalizarTimestamp(registro.timestamp);
        }
        
        // Normalizar campos para facilitar filtragem
        if (registro.tipo) {
            registro.operacao = normalizarTipoOperacao(registro.tipo);
        } else if (registro.type) {
            registro.operacao = normalizarTipoOperacao(registro.type);
        }
        
        // Extrair outros dados que possam estar em campos aninhados
        const dadosExtras = extrairDadosEmbutidos(registro);
        if (dadosExtras) {
            // Mesclar dados extras com o registro principal
            Object.assign(registro, dadosExtras);
        }
        
        return registro;
    });
    
    // Não chamar renderizarRegistros aqui pois será chamado por buscarRegistros
    
    return registrosProcessados;
}

// Renderizar registros na tabela DataTable
function renderizarRegistros(registros) {
    console.log(`Renderizando ${registros.length} registros na tabela...`);
    
    if (!dataTable) {
        console.error('DataTable não inicializada');
        // Esconder o spinner em caso de erro
        hideLoadingSpinner();
        return;
    }
    
    // Limpar a tabela existente
    dataTable.clear();
    
    // Verificar se temos registros para exibir
    if (registros.length === 0) {
        console.log('Nenhum registro para exibir');
        dataTable.draw();
        // Esconder o spinner mesmo se não houver registros
        hideLoadingSpinner();
        return;
    }
    
    // Log de debug para verificar a estrutura dos registros
    console.log('Exemplo de registro:', registros[0]);
    
    // Adicionar os novos dados
    registros.forEach(registro => {
        // Formatar os dados para exibição
        let dataFormatada = 'N/A';
        let horarioFormatado = 'N/A';
        
        try {
            // Garantir que timestamp seja processado corretamente
            if (registro.timestamp) {
                if (registro.timestamp instanceof Date) {
                    dataFormatada = formatarData(registro.timestamp);
                    horarioFormatado = formatarHorario(registro.timestamp);
                } else if (typeof registro.timestamp === 'object' && registro.timestamp.seconds) {
                    const data = new Date(registro.timestamp.seconds * 1000);
                    dataFormatada = formatarData(data);
                    horarioFormatado = formatarHorario(data);
                } else {
                    const data = new Date(registro.timestamp);
                    dataFormatada = formatarData(data);
                    horarioFormatado = formatarHorario(data);
                }
            }
        } catch (e) {
            console.error('Erro ao processar timestamp:', e);
        }
        
        // Extrair todas as possíveis informações para cada campo
        // Loja/Store (priorizar lojaId conforme solicitado)
        let loja = '';
        if (registro.lojaId) {
            loja = registro.lojaId;
        } else if (registro.storeId) {
            loja = registro.storeId;
        } else if (registro.dados && registro.dados.lojaId) {
            loja = registro.dados.lojaId;
        } else if (registro.store && registro.store.id) {
            loja = registro.store.id;
        } else if (registro.loja) {
            loja = registro.loja;
        } else if (registro.store) {
            loja = typeof registro.store === 'object' ? registro.store.name || JSON.stringify(registro.store) : registro.store;
        } else if (registro.dados && registro.dados.loja) {
            loja = registro.dados.loja;
        } else if (registro.dados && registro.dados.store) {
            loja = registro.dados.store;
        } else if (registro.configuracao && registro.configuracao.loja) {
            loja = registro.configuracao.loja;
        }
        
        // Usuário (priorizar displayName conforme solicitado)
        let usuario = '';
        if (registro.displayName) {
            usuario = registro.displayName;
        } else if (registro.user && registro.user.displayName) {
            usuario = registro.user.displayName;
        } else if (registro.usuario && registro.usuario.displayName) {
            usuario = registro.usuario.displayName;
        } else if (registro.dados && registro.dados.displayName) {
            usuario = registro.dados.displayName;
        } else if (registro.configuracao && registro.configuracao.displayName) {
            usuario = registro.configuracao.displayName;
        } else if (registro.usuario) {
            usuario = registro.usuario;
        } else if (registro.user) {
            usuario = typeof registro.user === 'object' ? registro.user.name || JSON.stringify(registro.user) : registro.user;
        } else if (registro.usuarioId) {
            usuario = registro.usuarioId;
        } else if (registro.userId) {
            usuario = registro.userId;
        } else if (registro.dados && registro.dados.usuario) {
            usuario = registro.dados.usuario;
        } else if (registro.criador) {
            usuario = registro.criador;
        }
        
        // Tipo de operação
        let operacao = '';
        if (registro.operacao) {
            operacao = registro.operacao;
        } else if (registro.tipo) {
            operacao = normalizarTipoOperacao(registro.tipo);
        } else if (registro.type) {
            operacao = normalizarTipoOperacao(registro.type);
        } else if (registro.tipoOperacao) {
            operacao = normalizarTipoOperacao(registro.tipoOperacao);
        } else if (registro.dados && registro.dados.tipo) {
            operacao = normalizarTipoOperacao(registro.dados.tipo);
        } else if (registro.dados && registro.dados.operacao) {
            operacao = registro.dados.operacao;
        }
        
        // Máquina - apenas o código, sem textos adicionais
        let maquina = '';
        if (registro.maquinaId) {
            maquina = registro.maquinaId;
        } else if (registro.machineId) {
            maquina = registro.machineId;
        } else if (registro.lavadoraId) {
            maquina = registro.lavadoraId;
        } else if (registro.secadoraId) {
            maquina = registro.secadoraId;
        } else if (registro.dosadoraId) {
            maquina = registro.dosadoraId;
        } else if (registro.maquina) {
            // Se for um string, usar diretamente
            if (typeof registro.maquina === 'string') {
                maquina = registro.maquina;
            }
            // Se for um objeto, tentar obter o ID
            else if (typeof registro.maquina === 'object' && registro.maquina !== null) {
                maquina = registro.maquina.id || registro.maquina.codigo || JSON.stringify(registro.maquina);
            }
        } else if (registro.machine) {
            // Mesmo tratamento para machine
            if (typeof registro.machine === 'string') {
                maquina = registro.machine;
            } else if (typeof registro.machine === 'object' && registro.machine !== null) {
                maquina = registro.machine.id || registro.machine.codigo || JSON.stringify(registro.machine);
            }
        } else if (registro.dispositivo) {
            maquina = registro.dispositivo;
        } else if (registro.equipamentoId) {
            maquina = registro.equipamentoId;
        }
        
        // Produto
        const produto = obterProduto(registro) || '';
        
        // Dosagem - converter para "Simples" ou "Dupla"
        let dosagem = '';
        let valorDosagem = null;
        
        // Se o produto for "sem amaciante", não mostrar a dosagem
        if (produto.toLowerCase() === 'sem amaciante') {
            dosagem = '-';
        } else {
        // Obter o valor bruto da dosagem
        if (registro.dose !== undefined) {
            valorDosagem = registro.dose;
        } else if (registro.dosagem !== undefined) {
            valorDosagem = registro.dosagem;
        } else if (registro.configuracao && registro.configuracao.dosagem !== undefined) {
            valorDosagem = registro.configuracao.dosagem;
        } else if (registro.dados && registro.dados.dosagem !== undefined) {
            valorDosagem = registro.dados.dosagem;
        }
        
        // Converter para o formato desejado
        if (valorDosagem !== null) {
            // Converter para número se for string
            if (typeof valorDosagem === 'string') {
                valorDosagem = valorDosagem.trim();
                valorDosagem = isNaN(valorDosagem) ? valorDosagem : Number(valorDosagem);
            }
            
            // Formatar conforme solicitado
            if (valorDosagem === 1 || valorDosagem === '1') {
                    dosagem = 'Simples';
            } else if (valorDosagem === 2 || valorDosagem === '2') {
                    dosagem = 'Dupla';
            } else {
                dosagem = valorDosagem.toString();
                }
            }
        }
        
        // Tempo
        let tempo = '';
        if (registro.tempo !== undefined) {
            tempo = registro.tempo;
        } else if (registro.tempoLiberacao !== undefined) {
            tempo = registro.tempoLiberacao;
        } else if (registro.time !== undefined) {
            tempo = registro.time;
        } else if (registro.duracao !== undefined) {
            tempo = registro.duracao;
        } else if (registro.configuracao && registro.configuracao.tempo !== undefined) {
            tempo = registro.configuracao.tempo;
        } else if (registro.dados && registro.dados.tempo !== undefined) {
            tempo = registro.dados.tempo;
        }
        
        // Adicionar linha à tabela
        try {
            dataTable.row.add([
                dataFormatada,
                horarioFormatado,
                loja,
                usuario,
                operacao,
                maquina,
                produto,
                dosagem,
                tempo
            ]);
        } catch (e) {
            console.error('Erro ao adicionar linha à tabela:', e);
        }
    });
    
    try {
        // Redesenhar a tabela completa
        dataTable.draw();
        
        // Garantir ordenação por data mais recente (ordem decrescente)
        setTimeout(function() {
            dataTable.order([0, 'desc']).draw();
            console.log('Ordenação por data mais recente aplicada');
            
            // Esconder o spinner após a tabela ser carregada
            hideLoadingSpinner();
        }, 100);
        
        console.log('Tabela atualizada com sucesso');
    } catch (e) {
        console.error('Erro ao redesenhar tabela:', e);
        // Esconder o spinner mesmo em caso de erro
        hideLoadingSpinner();
    }
}

// Exibir detalhes do registro
function exibirDetalhes(registro) {
    console.log("Exibindo detalhes:", registro);
    
    // Limpar conteúdo anterior
    const detalhesConteudo = document.getElementById('detalhesConteudo');
    detalhesConteudo.innerHTML = '';
    
    // Processar cada campo do registro
    for (const [chave, valor] of Object.entries(registro)) {
        if (chave === 'store' || chave === 'user') {
            // Processar objetos aninhados
            if (valor && typeof valor === 'object') {
                const subLista = document.createElement('ul');
                subLista.className = 'list-group list-group-flush';
                
                for (const [subChave, subValor] of Object.entries(valor)) {
                    const subItem = document.createElement('li');
                    subItem.className = 'list-group-item';
                    subItem.textContent = `${subChave}: ${subValor}`;
                    subLista.appendChild(subItem);
                }
                
                const item = document.createElement('li');
                item.className = 'list-group-item';
                
                const titulo = document.createElement('strong');
                titulo.textContent = chave;
                
                item.appendChild(titulo);
                item.appendChild(document.createElement('br'));
                item.appendChild(subLista);
                
                detalhesConteudo.appendChild(item);
            }
        } else if (chave !== 'timestamp') {
            // Exibir outros campos, exceto timestamp (já mostrado como data/hora)
            const item = document.createElement('li');
            item.className = 'list-group-item';
            
            // Verificar se o valor é um objeto
            if (valor && typeof valor === 'object' && !(valor instanceof Date)) {
                item.innerHTML = `<strong>${chave}:</strong> ${JSON.stringify(valor)}`;
            } else {
                item.innerHTML = `<strong>${chave}:</strong> ${valor}`;
            }
            
            detalhesConteudo.appendChild(item);
        }
    }
}

// Formatar data
function formatarData(timestamp) {
    if (!timestamp) return 'Indefinido';
    
    const data = timestamp instanceof Date ? timestamp : new Date(timestamp);
    
    return data.toLocaleDateString('pt-BR');
}

// Formatar horário
function formatarHorario(timestamp) {
    if (!timestamp) return 'Indefinido';
    
    const data = timestamp instanceof Date ? timestamp : new Date(timestamp);
    
    return data.toLocaleTimeString('pt-BR');
}

// Função para obter o produto
function obterProduto(registro) {
    // Verificar valores de bomba
    if (registro.bomba === 1 || registro.bomba === '1') return 'Sabão';
    if (registro.bomba === 2 || registro.bomba === '2') return 'Floral';
    if (registro.bomba === 3 || registro.bomba === '3') return 'Sport';
    
    // Verificar valores de amaciante
    if (registro.amaciante === 0 || registro.amaciante === '0') return 'Sem amaciante';
    if (registro.amaciante === 1 || registro.amaciante === '1') return 'Floral';
    if (registro.amaciante === 2 || registro.amaciante === '2') return 'Sport';
    
    // Verificar nos dados aninhados
    if (registro.configuracao) {
        if (registro.configuracao.bomba === 1 || registro.configuracao.bomba === '1') return 'Sabão';
        if (registro.configuracao.bomba === 2 || registro.configuracao.bomba === '2') return 'Floral';
        if (registro.configuracao.bomba === 3 || registro.configuracao.bomba === '3') return 'Sport';
        
        if (registro.configuracao.amaciante === 0 || registro.configuracao.amaciante === '0') return 'Sem amaciante';
        if (registro.configuracao.amaciante === 1 || registro.configuracao.amaciante === '1') return 'Floral';
        if (registro.configuracao.amaciante === 2 || registro.configuracao.amaciante === '2') return 'Sport';
    }
    
    if (registro.dados) {
        if (registro.dados.bomba === 1 || registro.dados.bomba === '1') return 'Sabão';
        if (registro.dados.bomba === 2 || registro.dados.bomba === '2') return 'Floral';
        if (registro.dados.bomba === 3 || registro.dados.bomba === '3') return 'Sport';
        
        if (registro.dados.amaciante === 0 || registro.dados.amaciante === '0') return 'Sem amaciante';
        if (registro.dados.amaciante === 1 || registro.dados.amaciante === '1') return 'Floral';
        if (registro.dados.amaciante === 2 || registro.dados.amaciante === '2') return 'Sport';
    }
    
    // Verificar se temos valores explícitos de produto
    if (registro.produto) return registro.produto;
    if (registro.product) return registro.product;
    if (registro.dados && registro.dados.produto) return registro.dados.produto;
    
    return '';
}

// Função para mostrar detalhes do registro
function mostrarDetalhes(dataHora) {
    // Encontrar o registro pelo timestamp formatado ou outros campos
    let registroEncontrado = null;
    
    // Verificar se temos registros no cache
    if (Object.keys(registrosCache).length === 0) {
        console.error('Cache de registros vazio');
        alert('Não foi possível encontrar o registro. Tente recarregar a página.');
        return;
    }
    
    // Iterar sobre o cache para encontrar o registro por data/hora
    for (const id in registrosCache) {
        const registro = registrosCache[id];
        const data = registro.timestamp instanceof Date ? 
                    registro.timestamp : 
                    new Date(registro.timestamp);
        
        const dataFormatada = formatarData(data);
        const horaFormatada = formatarHorario(data);
        
        if (`${dataFormatada} ${horaFormatada}` === dataHora) {
            registroEncontrado = registro;
            break;
        }
    }
    
    if (!registroEncontrado) {
        console.error('Registro não encontrado para dataHora:', dataHora);
        alert('Registro não encontrado. Tente recarregar a página.');
        return;
    }
    
    // Armazenar o registro para uso na função de exibir dados brutos
    window.currentRegistro = registroEncontrado;
    
    // Extrair informações de loja (priorizar lojaId)
    let lojaInfo = '';
    if (registroEncontrado.lojaId) {
        lojaInfo = registroEncontrado.lojaId;
    } else if (registroEncontrado.storeId) {
        lojaInfo = registroEncontrado.storeId;
    } else if (registroEncontrado.loja) {
        lojaInfo = registroEncontrado.loja;
    } else if (registroEncontrado.store) {
        lojaInfo = typeof registroEncontrado.store === 'object' ? 
                 (registroEncontrado.store.id || registroEncontrado.store.name || JSON.stringify(registroEncontrado.store)) : 
                 registroEncontrado.store;
    }
    
    // Extrair informações de usuário (priorizar displayName)
    let userInfo = '';
    if (registroEncontrado.displayName) {
        userInfo = registroEncontrado.displayName;
    } else if (registroEncontrado.user && registroEncontrado.user.displayName) {
        userInfo = registroEncontrado.user.displayName;
    } else if (registroEncontrado.usuario && registroEncontrado.usuario.displayName) {
        userInfo = registroEncontrado.usuario.displayName;
    } else if (registroEncontrado.usuario) {
        userInfo = registroEncontrado.usuario;
    } else if (registroEncontrado.user) {
        userInfo = typeof registroEncontrado.user === 'object' ? 
                 (registroEncontrado.user.name || JSON.stringify(registroEncontrado.user)) : 
                 registroEncontrado.user;
    } else if (registroEncontrado.usuarioId) {
        userInfo = registroEncontrado.usuarioId;
    } else if (registroEncontrado.userId) {
        userInfo = registroEncontrado.userId;
    }
    
    // Extrair código da máquina (apenas o código, sem texto adicional)
    let maquinaInfo = '';
    if (registroEncontrado.maquinaId) {
        maquinaInfo = registroEncontrado.maquinaId;
    } else if (registroEncontrado.machineId) {
        maquinaInfo = registroEncontrado.machineId;
    } else if (registroEncontrado.lavadoraId) {
        maquinaInfo = registroEncontrado.lavadoraId;
    } else if (registroEncontrado.secadoraId) {
        maquinaInfo = registroEncontrado.secadoraId;
    } else if (registroEncontrado.dosadoraId) {
        maquinaInfo = registroEncontrado.dosadoraId;
    } else if (registroEncontrado.maquina) {
        if (typeof registroEncontrado.maquina === 'string') {
            maquinaInfo = registroEncontrado.maquina;
        } else if (typeof registroEncontrado.maquina === 'object' && registroEncontrado.maquina !== null) {
            maquinaInfo = registroEncontrado.maquina.id || registroEncontrado.maquina.codigo || JSON.stringify(registroEncontrado.maquina);
        }
    } else if (registroEncontrado.machine) {
        if (typeof registroEncontrado.machine === 'string') {
            maquinaInfo = registroEncontrado.machine;
        } else if (typeof registroEncontrado.machine === 'object' && registroEncontrado.machine !== null) {
            maquinaInfo = registroEncontrado.machine.id || registroEncontrado.machine.codigo || JSON.stringify(registroEncontrado.machine);
        }
    } else if (registroEncontrado.dispositivo) {
        maquinaInfo = registroEncontrado.dispositivo;
    } else if (registroEncontrado.equipamentoId) {
        maquinaInfo = registroEncontrado.equipamentoId;
    }
    
    // Extrair e formatar informações de dosagem
    let dosagemInfo = '';
    let valorDosagem = null;
    
    // Obter valor bruto da dosagem
    if (registroEncontrado.dose !== undefined) {
        valorDosagem = registroEncontrado.dose;
    } else if (registroEncontrado.dosagem !== undefined) {
        valorDosagem = registroEncontrado.dosagem;
    } else if (registroEncontrado.configuracao && registroEncontrado.configuracao.dosagem !== undefined) {
        valorDosagem = registroEncontrado.configuracao.dosagem;
    } else if (registroEncontrado.dados && registroEncontrado.dados.dosagem !== undefined) {
        valorDosagem = registroEncontrado.dados.dosagem;
    }
    
    // Formatar dosagem
    if (valorDosagem !== null) {
        // Converter para número se for string
        if (typeof valorDosagem === 'string') {
            valorDosagem = valorDosagem.trim();
            valorDosagem = isNaN(valorDosagem) ? valorDosagem : Number(valorDosagem);
        }
        
        // Aplicar formatação
        if (valorDosagem === 1 || valorDosagem === '1') {
            dosagemInfo = 'Simples';
        } else if (valorDosagem === 2 || valorDosagem === '2') {
            dosagemInfo = 'Dupla';
        } else {
            dosagemInfo = valorDosagem.toString();
        }
    }
    
    // Preencher modal com dados do registro
    $('#detalheId').text(registroEncontrado.id);
    $('#detalheDataHora').text(`${formatarData(registroEncontrado.timestamp)} ${formatarHorario(registroEncontrado.timestamp)}`);
    $('#detalheEquipamento').text(extrairDispositivo(registroEncontrado));
    $('#detalheUsuario').text(userInfo);
    $('#detalheTipo').html(gerarBadgeOperacao(registroEncontrado.tipo || registroEncontrado.tipoOperacao || registroEncontrado.type || ''));
    $('#detalheMaquina').text(maquinaInfo);
    $('#detalheDescricao').text(registroEncontrado.descricao || registroEncontrado.mensagem || registroEncontrado.message || '');
    
    // Adicionar informação de loja se não estiver presente no HTML original
    if ($('#detalheLoja').length === 0) {
        $('#detalheUsuario').parent().before(`
            <li class="list-group-item">
                <span class="field-name">Loja:</span>
                <span class="field-value" id="detalheLoja">${lojaInfo}</span>
            </li>
        `);
    } else {
        $('#detalheLoja').text(lojaInfo);
    }
    
    // Adicionar informação de dosagem se não estiver presente no HTML original
    if ($('#detalheDosagem').length === 0 && dosagemInfo) {
        $('#detalheMaquina').parent().after(`
            <li class="list-group-item">
                <span class="field-name">Dosagem:</span>
                <span class="field-value" id="detalheDosagem">${dosagemInfo}</span>
            </li>
        `);
    } else if ($('#detalheDosagem').length > 0) {
        $('#detalheDosagem').text(dosagemInfo);
    }
    
    // Formatar JSON para melhor visualização
    const dadosJson = JSON.stringify(registroEncontrado, null, 2)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/\n/g, '<br>')
        .replace(/ /g, '&nbsp;');
    
    $('#detalhesDados').html(`<pre>${dadosJson}</pre>`);
    
    // Adicionar botão para visualizar dados brutos completos, se ainda não existir
    if ($('#btnVerDadosBrutos').length === 0) {
        $('#modalDetalhes .modal-footer').prepend(`
            <button type="button" class="btn btn-info" id="btnVerDadosBrutos">
                <i class="fas fa-code me-1"></i>Ver Dados Brutos
            </button>
        `);
        
        // Adicionar evento ao botão
        $('#btnVerDadosBrutos').on('click', function() {
            mostrarDadosBrutos();
        });
    }
    
    // Exibir modal
    $('#modalDetalhes').modal('show');
}

// Função para mostrar os dados brutos de um registro
function mostrarDadosBrutos() {
    if (!window.currentRegistro) {
        console.error('Nenhum registro selecionado');
        return;
    }
    
    // Formatação bonita do JSON para exibição
    const dadosFormatados = JSON.stringify(window.currentRegistro, replacer, 2);
    
    // Exibir no modal
    $('#dadosBrutosJson').text(dadosFormatados);
    
    // Fechar o modal de detalhes e abrir o de dados brutos
    $('#modalDetalhes').modal('hide');
    $('#dadosBrutosModal').modal('show');
}

// Função auxiliar para melhorar a exibição de JSON
function replacer(key, value) {
    // Converter objetos Firebase Timestamp para string legível
    if (value && typeof value === 'object' && value.seconds !== undefined && value.nanoseconds !== undefined) {
        return `Timestamp: ${new Date(value.seconds * 1000).toISOString()}`;
    }
    return value;
}

// Extrair dados que podem estar em campos aninhados
function extrairDadosEmbutidos(registro) {
    // Extrai campos como tempo de secagem, tipo de dosagem, tipo de produto, etc.
    
    // Busca em múltiplos níveis (registro direto, configuracao, dados)
    if (registro.configuracao) {
        // Extrai dados da configuração
        if (registro.configuracao.tempo) {
            registro.tempoLiberacao = registro.configuracao.tempo;
        }
        
        if (registro.configuracao.amaciante !== undefined) {
            registro.amaciante = registro.configuracao.amaciante;
        }
        
        if (registro.configuracao.dosagem !== undefined) {
            registro.dosagem = registro.configuracao.dosagem;
        }
        
        if (registro.configuracao.bomba !== undefined) {
            registro.bomba = registro.configuracao.bomba;
        }
        
        if (registro.configuracao.temperaturaAC !== undefined) {
            registro.temperaturaAC = registro.configuracao.temperaturaAC;
        }
    }
    
    // Verificar também no campo 'dados' se existir
    if (registro.dados) {
        if (registro.dados.tempo && !registro.tempoLiberacao) {
            registro.tempoLiberacao = registro.dados.tempo;
        }
        
        if (registro.dados.amaciante !== undefined && registro.amaciante === undefined) {
            registro.amaciante = registro.dados.amaciante;
        }
        
        if (registro.dados.dosagem !== undefined && registro.dosagem === undefined) {
            registro.dosagem = registro.dados.dosagem;
        }
        
        if (registro.dados.bomba !== undefined && registro.bomba === undefined) {
            registro.bomba = registro.dados.bomba;
        }
        
        if (registro.dados.temperaturaAC !== undefined && registro.temperaturaAC === undefined) {
            registro.temperaturaAC = registro.dados.temperaturaAC;
        }
    }
    
    return registro;
}

// Extrair informações do dispositivo do registro
function extrairDispositivo(registro) {
    // Tentar diversos campos possíveis para identificar o dispositivo
    return registro.dispositivo || 
           registro.equipamentoId || 
           registro.deviceId || 
           registro.idDispositivo || 
           registro.id || 
           'Dispositivo desconhecido';
}

// Função para carregar todos os registros sem eliminar duplicatas
function carregarTodosRegistros() {
    console.log('Carregando todos os registros sem eliminação de duplicatas...');
    
    // Atualizar aparência do botão
    const btnCarregarTodos = document.getElementById('btnCarregarTodos');
    if (btnCarregarTodos) {
        btnCarregarTodos.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Carregando...';
        btnCarregarTodos.disabled = true;
    }
    
    // Limpar as coleções de valores únicos para os filtros
    todasLojas.clear();
    todasMaquinas.clear();
    
    // Criar uma query para buscar todos os registros
    let query = firebase.firestore().collection(colecaoRegistros)
        .orderBy('timestamp', 'desc')
        .limit(500);
    
    // Executar a query
    query.get()
        .then(snapshot => {
            if (!snapshot.empty) {
                console.log(`Encontrados ${snapshot.size} registros brutos`);
                
                const registros = snapshot.docs.map(doc => {
                    const dados = doc.data();
                    dados.id = doc.id;
                    registrosCache[doc.id] = dados;
                    return dados;
                });
                
                // Armazenar registros originais
                dadosOriginais = registros;
                
                // Extrair valores únicos para os filtros, sem eliminar duplicatas
                registros.forEach(registro => {
                    if (registro.loja) todasLojas.add(registro.loja);
                    if (registro.store) todasLojas.add(registro.store);
                    if (registro.maquina) todasMaquinas.add(registro.maquina);
                    if (registro.machine) todasMaquinas.add(registro.machine);
                });
                
                // Popular os seletores de filtro
                popularSeletoresFiltro();
                
                // Processar registros sem eliminar duplicatas
                const registrosProcessados = registros.map(registro => {
                    // Normalizar timestamp
                    if (registro.timestamp && !(registro.timestamp instanceof Date)) {
                        if (typeof registro.timestamp === 'object' && registro.timestamp.seconds) {
                            registro.timestamp = new Date(registro.timestamp.seconds * 1000);
                        } else if (typeof registro.timestamp === 'string') {
                            registro.timestamp = new Date(registro.timestamp);
                        } else if (typeof registro.timestamp === 'number') {
                            registro.timestamp = new Date(registro.timestamp);
                        }
                    }
                    
                    // Normalizar tipo de operação
                    if (registro.tipo) {
                        registro.operacao = normalizarTipoOperacao(registro.tipo);
                    } else if (registro.type) {
                        registro.operacao = normalizarTipoOperacao(registro.type);
                    }
                    
                    return registro;
                });
                
                // Renderizar todos os registros processados
                renderizarRegistros(registrosProcessados);
                
                // Restaurar aparência do botão
                if (btnCarregarTodos) {
                    btnCarregarTodos.innerHTML = '<i class="fas fa-list-alt me-1"></i>Mostrar Todos Registros';
                    btnCarregarTodos.disabled = false;
                }
                
                console.log(`Exibindo todos os ${registrosProcessados.length} registros sem filtragem`);
            } else {
                console.log('Nenhum registro encontrado');
                alert('Não foram encontrados registros no Firestore.');
                
                // Restaurar aparência do botão
                if (btnCarregarTodos) {
                    btnCarregarTodos.innerHTML = '<i class="fas fa-list-alt me-1"></i>Mostrar Todos Registros';
                    btnCarregarTodos.disabled = false;
                }
            }
        })
        .catch(error => {
            console.error('Erro ao buscar registros:', error);
            alert(`Erro ao buscar registros: ${error.message}`);
            
            // Restaurar aparência do botão
            if (btnCarregarTodos) {
                btnCarregarTodos.innerHTML = '<i class="fas fa-list-alt me-1"></i>Mostrar Todos Registros';
                btnCarregarTodos.disabled = false;
            }
        });
}

// Função para carregar dados de status_machine do Firebase
function carregarStatusMachine(forceRefresh = false) {
    console.log('Carregando dados de status_machine...');
    
    // Mostrar spinner na tabela
    const statusMachineTableBody = document.getElementById('statusMachineTableBody');
    if (statusMachineTableBody) {
        statusMachineTableBody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-4">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Carregando...</span>
                    </div>
                    <p class="mt-2">Carregando dados de status...</p>
                </td>
            </tr>
        `;
    }
    
    // Verificar se há dados em cache e se não estamos forçando uma atualização
    if (!forceRefresh) {
        const cachedData = carregarStatusMachineDoCache();
        if (cachedData && cachedData.length > 0) {
            console.log(`Carregados ${cachedData.length} registros de status_machine do cache`);
            processarDadosStatusMachine(cachedData);
            return;
        }
    }
    
    // Buscar no Firebase
    const database = firebase.database();
    const lojas = database.ref('/');
    
    lojas.once('value')
        .then(snapshot => {
            const dados = snapshot.val() || {};
            const statusMachineArray = [];
            
            // Percorrer todas as lojas
            for (const lojaId in dados) {
                // Verificar se a loja tem o nó status
                if (dados[lojaId] && dados[lojaId].status) {
                    const statusData = dados[lojaId].status;
                    
                    // Adicionar loja ao conjunto de lojas com status
                    lojasComStatus.add(lojaId);
                    
                    // Processar lavadoras
                    if (statusData.lavadoras) {
                        for (const id in statusData.lavadoras) {
                            statusMachineArray.push({
                                loja: lojaId,
                                tipo: 'Lavadora',
                                id: id,
                                status: statusData.lavadoras[id] || 'desconhecido',
                                lastUpdate: Date.now(), // Timestamp atual como referência
                                detalhes: {
                                    tipo: 'lavadora',
                                    historico: [] // Inicialmente sem histórico
                                }
                            });
                        }
                    }
                    
                    // Processar secadoras
                    if (statusData.secadoras) {
                        for (const id in statusData.secadoras) {
                            statusMachineArray.push({
                                loja: lojaId,
                                tipo: 'Secadora',
                                id: id,
                                status: statusData.secadoras[id] || 'desconhecido',
                                lastUpdate: Date.now(), // Timestamp atual como referência
                                detalhes: {
                                    tipo: 'secadora',
                                    historico: [] // Inicialmente sem histórico
                                }
                            });
                        }
                    }
                    
                    // Processar dosadoras
                    if (statusData.dosadoras) {
                        for (const id in statusData.dosadoras) {
                            statusMachineArray.push({
                                loja: lojaId,
                                tipo: 'Dosadora',
                                id: id,
                                status: statusData.dosadoras[id] || 'desconhecido',
                                lastUpdate: Date.now(), // Timestamp atual como referência
                                detalhes: {
                                    tipo: 'dosadora',
                                    historico: [] // Inicialmente sem histórico
                                }
                            });
                        }
                    }
                    
                    // Processar ar condicionado, se existir
                    if (statusData.ar_condicionado) {
                        statusMachineArray.push({
                            loja: lojaId,
                            tipo: 'Ar-Condicionado',
                            id: 'AC-01',
                            status: statusData.ar_condicionado || 'desconhecido',
                            lastUpdate: Date.now(), // Timestamp atual como referência
                            detalhes: {
                                tipo: 'ar_condicionado',
                                historico: [] // Inicialmente sem histórico
                            }
                        });
                    }
                }
            }
            
            console.log(`Encontrados ${statusMachineArray.length} registros de status_machine`);
            
            // Salvar os dados em cache
            salvarStatusMachineNoCache(statusMachineArray);
            
            // Processar e exibir os dados
            processarDadosStatusMachine(statusMachineArray);
        })
        .catch(error => {
            console.error('Erro ao carregar dados de status_machine:', error);
            
            if (statusMachineTableBody) {
                statusMachineTableBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="text-center py-4">
                            <div class="alert alert-danger">
                                <i class="fas fa-exclamation-circle me-2"></i>
                                Erro ao carregar dados: ${error.message}
                            </div>
                        </td>
                    </tr>
                `;
            }
        });
}

// Função para salvar dados de status_machine no cache
function salvarStatusMachineNoCache(dados) {
    try {
        localStorage.setItem(CACHE_KEY_STATUS_MACHINE, JSON.stringify(dados));
        localStorage.setItem(CACHE_KEY_STATUS_MACHINE_TIMESTAMP, Date.now().toString());
        console.log(`${dados.length} registros de status_machine salvos no cache`);
    } catch (error) {
        console.error('Erro ao salvar status_machine no cache:', error);
    }
}

// Função para carregar dados de status_machine do cache
function carregarStatusMachineDoCache() {
    try {
        // Verificar se existe cache
        const cachedTimestamp = localStorage.getItem(CACHE_KEY_STATUS_MACHINE_TIMESTAMP);
        if (!cachedTimestamp) return null;
        
        // Verificar se o cache está expirado
        const timestamp = parseInt(cachedTimestamp);
        const agora = Date.now();
        if (agora - timestamp > CACHE_EXPIRY_TIME) {
            console.log('Cache de status_machine expirado, será recarregado do Firebase');
            return null;
        }
        
        // Carregar os dados
        const cachedData = localStorage.getItem(CACHE_KEY_STATUS_MACHINE);
        if (!cachedData) return null;
        
        // Converter para objeto
        return JSON.parse(cachedData);
    } catch (error) {
        console.error('Erro ao carregar status_machine do cache:', error);
        return null;
    }
}

// Função para processar e exibir dados de status_machine
function processarDadosStatusMachine(dados) {
    // Armazenar os dados globalmente
    statusMachineData = dados;
    
    // Inicialmente, não aplicamos filtros
    filteredStatusMachineData = [...dados];
    
    // Atualizar seletores de filtro
    atualizarSeletoresStatusMachine();
    
    // Renderizar a tabela
    renderizarTabelaStatusMachine(filteredStatusMachineData);
}

// Função para atualizar os seletores de filtro do status_machine
function atualizarSeletoresStatusMachine() {
    const lojaFilter = document.getElementById('statusMachineLojaFilter');
    if (!lojaFilter) return;
    
    // Limpar opções existentes
    lojaFilter.innerHTML = '<option value="">Todas as Lojas</option>';
    
    // Adicionar lojas únicas
    const lojas = Array.from(lojasComStatus).sort();
    lojas.forEach(loja => {
        const option = document.createElement('option');
        option.value = loja;
        option.textContent = loja;
        lojaFilter.appendChild(option);
    });
}

// Função para aplicar filtros aos dados de status_machine
function aplicarFiltrosStatusMachine() {
    const lojaFilter = document.getElementById('statusMachineLojaFilter');
    const statusFilter = document.getElementById('statusMachineFilter');
    
    if (!lojaFilter || !statusFilter) return;
    
    const lojaValue = lojaFilter.value;
    const statusValue = statusFilter.value;
    
    // Aplicar filtros
    filteredStatusMachineData = statusMachineData.filter(item => {
        // Filtro de loja
        if (lojaValue && item.loja !== lojaValue) {
            return false;
        }
        
        // Filtro de status
        if (statusValue && item.status !== statusValue) {
            return false;
        }
        
        return true;
    });
    
    // Renderizar tabela com dados filtrados
    renderizarTabelaStatusMachine(filteredStatusMachineData);
}

// Função para renderizar a tabela de status_machine
function renderizarTabelaStatusMachine(dados) {
    const tbody = document.getElementById('statusMachineTableBody');
    if (!tbody) return;
    
    // Limpar tabela
    tbody.innerHTML = '';
    
    // Se não houver dados
    if (!dados || dados.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-4">
                    <div class="alert alert-info">
                        <i class="fas fa-info-circle me-2"></i>
                        Nenhum dado encontrado.
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    // Adicionar linhas à tabela
    dados.forEach(item => {
        const tr = document.createElement('tr');
        
        // Status formata na cor correspondente
        const statusHtml = item.status === 'online' ? 
            `<span class="badge bg-success">Online</span>` : 
            item.status === 'offline' ? 
            `<span class="badge bg-danger">Offline</span>` : 
            item.status === 'liberando' || item.status === 'processando' ? 
            `<span class="badge bg-info">Processando</span>` : 
            `<span class="badge bg-secondary">${item.status}</span>`;
        
        // Formatar data
        const dataHora = formatarTempoRelativo(Date.now() - item.lastUpdate);
        
        tr.innerHTML = `
            <td>${item.loja}</td>
            <td>${item.tipo}</td>
            <td>${item.id}</td>
            <td>${statusHtml}</td>
            <td>${dataHora}</td>
            <td>
                <button class="btn btn-sm btn-outline-info view-machine-details" data-loja="${item.loja}" data-tipo="${item.tipo}" data-id="${item.id}">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        `;
        
        tbody.appendChild(tr);
    });
    
    // Adicionar eventos aos botões de visualizar detalhes
    document.querySelectorAll('.view-machine-details').forEach(btn => {
        btn.addEventListener('click', function() {
            const loja = this.getAttribute('data-loja');
            const tipo = this.getAttribute('data-tipo');
            const id = this.getAttribute('data-id');
            
            mostrarDetalhesMachine(loja, tipo, id);
        });
    });
}

// Função para mostrar detalhes de uma máquina
function mostrarDetalhesMachine(loja, tipo, id) {
    console.log(`Exibindo detalhes da máquina: ${tipo} ${id} da loja ${loja}`);
    
    // Encontrar os dados da máquina
    const machine = statusMachineData.find(item => 
        item.loja === loja && item.tipo === tipo && item.id === id
    );
    
    if (!machine) {
        console.error('Máquina não encontrada');
        return;
    }
    
    // Preencher os campos do modal
    document.getElementById('detailLoja').textContent = machine.loja;
    document.getElementById('detailTipo').textContent = machine.tipo;
    document.getElementById('detailId').textContent = machine.id;
    
    // Status formata na cor correspondente
    const statusEl = document.getElementById('detailStatus');
    if (statusEl) {
        statusEl.innerHTML = machine.status === 'online' ? 
            `<span class="badge bg-success">Online</span>` : 
            machine.status === 'offline' ? 
            `<span class="badge bg-danger">Offline</span>` : 
            machine.status === 'liberando' || machine.status === 'processando' ? 
            `<span class="badge bg-info">Processando</span>` : 
            `<span class="badge bg-secondary">${machine.status}</span>`;
    }
    
    // Última atualização
    document.getElementById('detailLastUpdate').textContent = formatarTempoRelativo(Date.now() - machine.lastUpdate);
    
    // Dados adicionais
    const additionalDataEl = document.getElementById('detailAdditionalData');
    if (additionalDataEl) {
        additionalDataEl.innerHTML = `<pre>${JSON.stringify(machine.detalhes, null, 2)}</pre>`;
    }
    
    // Histórico (ainda sem dados, apenas exemplo)
    const historyBody = document.getElementById('detailHistoryBody');
    if (historyBody) {
        if (machine.detalhes.historico && machine.detalhes.historico.length > 0) {
            historyBody.innerHTML = machine.detalhes.historico
                .map(hist => `
                    <tr>
                        <td>${formatarData(hist.timestamp)}</td>
                        <td><span class="badge bg-${hist.status === 'online' ? 'success' : 'danger'}">${hist.status}</span></td>
                        <td>${hist.evento || '-'}</td>
                    </tr>
                `).join('');
        } else {
            historyBody.innerHTML = `
                <tr>
                    <td colspan="3" class="text-center py-3">
                        <i class="text-muted">Nenhum histórico disponível</i>
                    </td>
                </tr>
            `;
        }
    }
    
    // Configurar botão de refresh
    const refreshBtn = document.getElementById('refreshMachineDetail');
    if (refreshBtn) {
        refreshBtn.onclick = function() {
            buscarDetalhesAtualizados(loja, tipo, id);
        };
    }
    
    // Exibir o modal
    if (machineStatusDetailModal) {
        machineStatusDetailModal.show();
    }
}

// Função para buscar detalhes atualizados de uma máquina
function buscarDetalhesAtualizados(loja, tipo, id) {
    console.log(`Buscando detalhes atualizados: ${tipo} ${id} da loja ${loja}`);
    
    // Mostrar spinner enquanto carrega
    document.getElementById('detailAdditionalData').innerHTML = `
        <div class="text-center py-3">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Carregando...</span>
            </div>
            <p class="mt-2">Atualizando dados...</p>
        </div>
    `;
    
    // Buscar dados atualizados no Firebase
    const tipoRef = tipo === 'Lavadora' ? 'lavadoras' : 
                  tipo === 'Secadora' ? 'secadoras' : 
                  tipo === 'Dosadora' ? 'dosadoras' : 'ar_condicionado';
    
    const database = firebase.database();
    const machineRef = database.ref(`/${loja}/status/${tipoRef}/${id}`);
    
    machineRef.once('value')
        .then(snapshot => {
            const dadosAtualizados = snapshot.val();
            
            // Atualizar o status_machine nos dados
            const machineIndex = statusMachineData.findIndex(item => 
                item.loja === loja && item.tipo === tipo && item.id === id
            );
            
            if (machineIndex !== -1) {
                // Atualizar o status
                statusMachineData[machineIndex].status = dadosAtualizados || 'desconhecido';
                statusMachineData[machineIndex].lastUpdate = Date.now();
                
                // Adicionar ao histórico
                if (!statusMachineData[machineIndex].detalhes.historico) {
                    statusMachineData[machineIndex].detalhes.historico = [];
                }
                
                statusMachineData[machineIndex].detalhes.historico.unshift({
                    timestamp: Date.now(),
                    status: dadosAtualizados || 'desconhecido',
                    evento: 'Atualização manual'
                });
                
                // Limitar histórico a 10 entradas
                if (statusMachineData[machineIndex].detalhes.historico.length > 10) {
                    statusMachineData[machineIndex].detalhes.historico = 
                        statusMachineData[machineIndex].detalhes.historico.slice(0, 10);
                }
                
                // Salvar no cache
                salvarStatusMachineNoCache(statusMachineData);
                
                // Filtrar dados novamente para atualizar a visualização
                aplicarFiltrosStatusMachine();
                
                // Mostrar detalhes atualizados
                mostrarDetalhesMachine(loja, tipo, id);
            }
        })
        .catch(error => {
            console.error('Erro ao atualizar detalhes:', error);
            document.getElementById('detailAdditionalData').innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-circle me-2"></i>
                    Erro ao atualizar: ${error.message}
                </div>
            `;
        });
}

// Função para limpar cache
function limparCache() {
    try {
        // Limpar cache de logs
        localStorage.removeItem(CACHE_KEY_LOGS);
        localStorage.removeItem(CACHE_KEY_LOGS_TIMESTAMP);
        
        // Limpar cache de status_machine
        localStorage.removeItem(CACHE_KEY_STATUS_MACHINE);
        localStorage.removeItem(CACHE_KEY_STATUS_MACHINE_TIMESTAMP);
        
        // Mostrar toast de sucesso
        showToast('Cache limpo com sucesso!', 'success');
        
        // Atualizar a badge de fonte de dados
        atualizarBadgeFonteDados('firebase');
        
        console.log('Cache limpo com sucesso');
    } catch (error) {
        console.error('Erro ao limpar cache:', error);
        showToast('Erro ao limpar cache: ' + error.message, 'error');
    }
}

// Inicializar a página quando o documento estiver pronto
document.addEventListener('DOMContentLoaded', function() {
    // Fallback para garantir que o spinner seja ocultado após um tempo limite
    setTimeout(function() {
        hideLoadingSpinner();
    }, 3000); // 3 segundos de tempo limite
    
    // Também adicionar click event handler para forçar a ocultação do spinner 
    // caso o usuário precise clicar para removê-lo
    document.body.addEventListener('click', function() {
        hideLoadingSpinner();
    }, { once: true }); // Executa apenas uma vez
    
    // Verificar autenticação do usuário
    firebase.auth().onAuthStateChanged(function(user) {
        if (user) {
            console.log('Usuário autenticado:', user.email);
            
            // Atualizar elementos da interface com informações do usuário
            const currentUserElements = document.querySelectorAll('#currentUser');
            const currentUserNameElements = document.querySelectorAll('#currentUserName');
            const currentUserEmailElements = document.querySelectorAll('#currentUserEmail');
            
            // Nome a ser exibido (priorizar displayName, se não disponível usar email)
            const displayName = user.displayName || user.email.split('@')[0] || 'Usuário';
            const userEmail = user.email || '';
            
            // Atualizar todos os elementos com o nome do usuário
            currentUserElements.forEach(el => {
                el.textContent = displayName;
            });
            
            // Atualizar todos os elementos com o nome completo do usuário
            currentUserNameElements.forEach(el => {
                el.textContent = displayName;
            });
            
            // Atualizar todos os elementos com o email do usuário
            currentUserEmailElements.forEach(el => {
                el.textContent = userEmail;
            });
            
            inicializarPagina();
        } else {
            console.log('Usuário não autenticado, redirecionando para login...');
            window.location.href = 'login.html';
        }
    });
    
    // Configurar botão de logout
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', function(e) {
            e.preventDefault();
        firebase.auth().signOut()
            .then(() => {
                window.location.href = 'login.html';
            })
            .catch(error => {
                console.error('Erro ao fazer logout:', error);
                alert('Erro ao fazer logout. Tente novamente.');
            });
    });
    }
    
    // Configurar botão Meu Perfil
    const btnUserProfile = document.getElementById('user-profile');
    if (btnUserProfile) {
        btnUserProfile.addEventListener('click', function(e) {
            e.preventDefault();
            // Verificar se o usuário está autenticado
            const user = firebase.auth().currentUser;
            if (user) {
                // Exibir modal com informações do usuário ou redirecionar para página de perfil
                Swal.fire({
                    title: 'Perfil do Usuário',
                    html: `
                        <div class="text-start">
                            <p><strong>Nome:</strong> ${user.displayName || 'Não definido'}</p>
                            <p><strong>E-mail:</strong> ${user.email}</p>
                            <p><strong>Conta criada em:</strong> ${user.metadata.creationTime ? new Date(user.metadata.creationTime).toLocaleString() : 'Não disponível'}</p>
                            <p><strong>Último login:</strong> ${user.metadata.lastSignInTime ? new Date(user.metadata.lastSignInTime).toLocaleString() : 'Não disponível'}</p>
                        </div>
                    `,
                    icon: 'info',
                    confirmButtonText: 'Fechar'
                });
            } else {
                // Se não estiver autenticado, redirecionar para login
                window.location.href = 'login.html';
            }
        });
    }
    
    // Configurar botão Alterar Senha
    const btnChangePassword = document.getElementById('change-password');
    if (btnChangePassword) {
        btnChangePassword.addEventListener('click', function(e) {
            e.preventDefault();
            // Verificar se o usuário está autenticado
            const user = firebase.auth().currentUser;
            if (user) {
                // Exibir modal para alteração de senha
                Swal.fire({
                    title: 'Alterar Senha',
                    html: `
                        <input type="password" id="swal-current-password" class="swal2-input" placeholder="Senha atual">
                        <input type="password" id="swal-new-password" class="swal2-input" placeholder="Nova senha">
                        <input type="password" id="swal-confirm-password" class="swal2-input" placeholder="Confirmar nova senha">
                    `,
                    focusConfirm: false,
                    showCancelButton: true,
                    confirmButtonText: 'Alterar Senha',
                    cancelButtonText: 'Cancelar',
                    preConfirm: () => {
                        const currentPassword = document.getElementById('swal-current-password').value;
                        const newPassword = document.getElementById('swal-new-password').value;
                        const confirmPassword = document.getElementById('swal-confirm-password').value;
                        
                        // Validar entradas
                        if (!currentPassword || !newPassword || !confirmPassword) {
                            Swal.showValidationMessage('Todos os campos são obrigatórios');
                            return false;
                        }
                        
                        if (newPassword !== confirmPassword) {
                            Swal.showValidationMessage('As senhas não coincidem');
                            return false;
                        }
                        
                        if (newPassword.length < 6) {
                            Swal.showValidationMessage('A nova senha deve ter pelo menos 6 caracteres');
                            return false;
                        }
                        
                        return { currentPassword, newPassword };
                    }
                }).then((result) => {
                    if (result.isConfirmed) {
                        // Atualizar a senha do usuário
                        const credential = firebase.auth.EmailAuthProvider.credential(
                            user.email, 
                            result.value.currentPassword
                        );
                        
                        // Reautenticar o usuário
                        user.reauthenticateWithCredential(credential)
                            .then(() => {
                                // Após reautenticação, alterar a senha
                                return user.updatePassword(result.value.newPassword);
                            })
                            .then(() => {
                                Swal.fire(
                                    'Senha Alterada',
                                    'Sua senha foi alterada com sucesso.',
                                    'success'
                                );
                            })
                            .catch(error => {
                                console.error('Erro ao alterar senha:', error);
                                let mensagemErro = 'Erro ao alterar senha. Tente novamente.';
                                
                                // Mensagens de erro personalizadas
                                if (error.code === 'auth/wrong-password') {
                                    mensagemErro = 'Senha atual incorreta. Tente novamente.';
                                } else if (error.code === 'auth/weak-password') {
                                    mensagemErro = 'A nova senha é muito fraca. Use uma senha mais forte.';
                                }
                                
                                Swal.fire(
                                    'Erro',
                                    mensagemErro,
                                    'error'
                                );
                            });
                    }
                });
            } else {
                // Se não estiver autenticado, redirecionar para login
                window.location.href = 'login.html';
            }
        });
    }
    
    // Configurar botão para limpar cache, se existir
    const btnLimparCache = document.getElementById('clear-cache');
    if (btnLimparCache) {
        btnLimparCache.addEventListener('click', function(e) {
            e.preventDefault();
            limparCache();
        });
    }
    
    // Configurar botão para carregar todos os registros
    const btnCarregarTodos = document.getElementById('btnCarregarTodos');
    if (btnCarregarTodos) {
        btnCarregarTodos.addEventListener('click', carregarTodosRegistros);
    }

    // Adicionar evento ao botão de recarregar tabela
    if (btnRecarregarTabela) {
    btnRecarregarTabela.addEventListener('click', () => {
        console.log('Solicitada recarga manual da tabela');
            buscarRegistrosDoFirebase();
    });
    }
    
    // Adicionar evento ao botão de aplicar filtros
    if (btnAplicarFiltros) {
        btnAplicarFiltros.addEventListener('click', function() {
            console.log('Botão Aplicar Filtros clicado');
            aplicarFiltros();
            salvarFiltrosLogs();
    });
    }
    
    // Carregar filtros salvos
    carregarFiltrosSalvosLogs();
    
    // Inicializar modais de Status de Máquinas
    const statusMachinesModalElement = document.getElementById('statusMachinesModal');
    if (statusMachinesModalElement) {
        statusMachineModal = new bootstrap.Modal(statusMachinesModalElement);
    }
    
    const machineStatusDetailModalElement = document.getElementById('machineStatusDetailModal');
    if (machineStatusDetailModalElement) {
        machineStatusDetailModal = new bootstrap.Modal(machineStatusDetailModalElement);
    }
    
    // Configurar botão de Status de Máquinas
    const btnStatusMachines = document.getElementById('status-machines-btn');
    if (btnStatusMachines) {
        btnStatusMachines.addEventListener('click', function(e) {
            e.preventDefault();
            // Carregar dados antes de exibir o modal
            carregarStatusMachine();
            // Exibir o modal
            if (statusMachineModal) {
                statusMachineModal.show();
            }
        });
    }
    
    // Configurar botões de filtro do Status de Máquinas
    const applyStatusMachineFiltersBtn = document.getElementById('applyStatusMachineFilters');
    if (applyStatusMachineFiltersBtn) {
        applyStatusMachineFiltersBtn.addEventListener('click', function() {
            aplicarFiltrosStatusMachine();
        });
    }
    
    const clearStatusMachineFiltersBtn = document.getElementById('clearStatusMachineFilters');
    if (clearStatusMachineFiltersBtn) {
        clearStatusMachineFiltersBtn.addEventListener('click', function() {
            // Limpar os filtros
            const lojaFilter = document.getElementById('statusMachineLojaFilter');
            const statusFilter = document.getElementById('statusMachineFilter');
            
            if (lojaFilter) lojaFilter.value = '';
            if (statusFilter) statusFilter.value = '';
            
            // Recarregar dados sem filtro
            filteredStatusMachineData = [...statusMachineData];
            renderizarTabelaStatusMachine(filteredStatusMachineData);
        });
    }
    
    // Configurar botão de atualizar status_machine
    const refreshStatusMachineBtn = document.getElementById('refreshStatusMachine');
    if (refreshStatusMachineBtn) {
        refreshStatusMachineBtn.addEventListener('click', function() {
            carregarStatusMachine(true); // forçar atualização
        });
    }
});

// Função para formatar tempo relativo (quantos minutos/horas atrás)
function formatarTempoRelativo(diffMs) {
    // Converter para segundos
    const diffSec = Math.floor(diffMs / 1000);
    
    // Menos de 1 minuto
    if (diffSec < 60) {
        return 'Agora mesmo';
    }
    
    // Menos de 1 hora
    if (diffSec < 3600) {
        const mins = Math.floor(diffSec / 60);
        return `${mins} ${mins === 1 ? 'minuto' : 'minutos'} atrás`;
    }
    
    // Menos de 1 dia
    if (diffSec < 86400) {
        const hours = Math.floor(diffSec / 3600);
        return `${hours} ${hours === 1 ? 'hora' : 'horas'} atrás`;
    }
    
    // Mais de 1 dia
    const days = Math.floor(diffSec / 86400);
    return `${days} ${days === 1 ? 'dia' : 'dias'} atrás`;
}

// Função para mostrar toast de notificação
function showToast(message, type = 'info') {
    // Verificar se o container de toast existe
    let toastContainer = document.getElementById('toast-container');
    
    // Se não existir, criar um
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'position-fixed bottom-0 end-0 p-3';
        toastContainer.style.zIndex = '11';
        document.body.appendChild(toastContainer);
    }
    
    // Criar um ID único para o toast
    const toastId = `toast-${Date.now()}`;
    
    // Definir classe de cor baseada no tipo
    let bgClass = 'bg-info';
    let iconClass = 'fa-info-circle';
    
    switch (type) {
        case 'success':
            bgClass = 'bg-success';
            iconClass = 'fa-check-circle';
            break;
        case 'error':
            bgClass = 'bg-danger';
            iconClass = 'fa-exclamation-circle';
            break;
        case 'warning':
            bgClass = 'bg-warning';
            iconClass = 'fa-exclamation-triangle';
            break;
    }
    
    // Criar o HTML do toast
    const toastHTML = `
        <div id="${toastId}" class="toast" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="toast-header ${bgClass} text-white">
                <i class="fas ${iconClass} me-2"></i>
                <strong class="me-auto">Notificação</strong>
                <small>Agora</small>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
            <div class="toast-body">
                ${message}
            </div>
        </div>
    `;
    
    // Adicionar o toast ao container
    toastContainer.innerHTML += toastHTML;
    
    // Inicializar o toast via Bootstrap
    const toastElement = document.getElementById(toastId);
    if (toastElement) {
        const toast = new bootstrap.Toast(toastElement, {
            autohide: true,
            delay: 5000
        });
        
        toast.show();
        
        // Remover o toast do DOM após ser fechado
        toastElement.addEventListener('hidden.bs.toast', function() {
            toastElement.remove();
        });
    }
}