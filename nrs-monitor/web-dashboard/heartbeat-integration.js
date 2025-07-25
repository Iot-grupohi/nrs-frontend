// Integração do monitoramento de heartbeat com o frontend existente
// Este arquivo adiciona funcionalidades para monitorar heartbeats e atualizar o status no frontend

// NOTA IMPORTANTE: A loja SP01 utiliza uma placa ESP em vez do aplicativo Python como as outras lojas.
// Por isso, foi implementado um tratamento especial para SP01 onde ignoramos diferenças de horário
// e consideramos apenas se a data do heartbeat é a mesma que hoje, evitando que ela apareça como offline
// devido a problemas de sincronização de relógio da placa ESP.

// Configuração
const HEARTBEAT_CHECK_INTERVAL = 60000; // Verificar a cada 60 segundos
const ONLINE_THRESHOLD = 1.5; // Multiplicador do intervalo para considerar online

// Função para determinar o status baseado no heartbeat
function determinarStatusPorHeartbeat(heartbeat, intervalo = 180, lojaId = '') {
    const agora = Date.now();
    const intervaloMs = intervalo * 1000; // Converter para milissegundos
    
    // Se não há heartbeat, está offline
    if (!heartbeat) {
        return {
            status: "Offline", 
            classe: "bg-danger", 
            indicador: "status-offline"
        };
    }
    
    // Caso especial para SP01 (que usa ESP)
    if (lojaId === 'SP01') {
        // Verificar se o heartbeat é de hoje (solução para o problema de timestamp incorreto na ESP)
        const heartbeatDate = new Date(heartbeat);
        const now = new Date(agora);
        
        // Se o heartbeat e o atual são da mesma data (ignorando hora), consideramos online
        const isSameDate = 
            heartbeatDate.getFullYear() === now.getFullYear() &&
            heartbeatDate.getMonth() === now.getMonth() &&
            heartbeatDate.getDate() === now.getDate();
        
        // Se for da mesma data que hoje, SP01 está online independente da hora
        if (isSameDate) {
            return {
                status: "Online",
                classe: "bg-success",
                indicador: "status-online"
            };
        }
    }
    
    // Para outras lojas, lógica padrão
    if (agora - heartbeat < intervaloMs * ONLINE_THRESHOLD) {
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

// Função para atualizar o status de uma loja na tabela
function atualizarStatusLojaNaTabela(lojaId, statusInfo, heartbeat) {
    // Encontrar a linha da loja na tabela
    const row = document.querySelector(`#lojas-table-body tr[data-loja="${lojaId}"]`);
    if (!row) return;
    
    // Atualizar o status visual
    const statusIndicator = row.querySelector('.status-indicator');
    const statusText = row.querySelector('.loja-status');
    const atualizacaoText = row.querySelector('.loja-atualizacao');
    
    if (statusIndicator && statusText) {
        statusIndicator.className = `status-indicator me-2 ${statusInfo.indicador}`;
        statusText.textContent = statusInfo.status;
        statusText.className = `loja-status ${statusInfo.classe === 'bg-success' ? 'text-success' : 'text-danger'}`;
        
        // Atualizar classe da linha para destacar status
        if (statusInfo.status === 'Offline') {
            row.classList.add('table-danger');
        } else {
            row.classList.remove('table-danger');
        }
    }
    
    // Atualizar timestamp se disponível
    if (atualizacaoText && heartbeat) {
        // Formatar data do heartbeat
        const data = new Date(parseInt(heartbeat));
        const horas = data.getHours().toString().padStart(2, '0');
        const minutos = data.getMinutes().toString().padStart(2, '0');
        const segundos = data.getSeconds().toString().padStart(2, '0');
        
        atualizacaoText.textContent = `${horas}:${minutos}:${segundos}`;
    }
}

// Função para monitorar heartbeat e status de todas as lojas
function monitorarHeartbeat() {
    // Referência ao banco de dados
    const database = firebase.database();
    
    // Buscar todas as lojas
    database.ref('/').once('value', (snapshot) => {
        const lojas = snapshot.val();
        
        // Para cada loja, configurar monitores
        for (const lojaId in lojas) {
            // Verificar se é realmente uma loja
            if (typeof lojas[lojaId] === 'object') {
                // Monitor para heartbeat
                const heartbeatRef = database.ref(`/${lojaId}/heartbeat`);
                heartbeatRef.on('value', (snapshot) => {
                    const heartbeat = snapshot.val();
                    if (heartbeat) {
                        // Determinar status baseado no heartbeat
                        const intervalo = lojas[lojaId].heartbeat_interval || 180;
                        const statusInfo = determinarStatusPorHeartbeat(heartbeat, intervalo, lojaId);
                        
                        // Atualizar status visual na tabela - passar o heartbeat
                        atualizarStatusLojaNaTabela(lojaId, statusInfo, heartbeat);
                    }
                });
            }
        }
        
        // Atualizar o contador de lojas
        const storeCountElement = document.getElementById('store-count');
        if (storeCountElement) {
            const lojaCount = Object.keys(lojas).filter(key => typeof lojas[key] === 'object').length;
            storeCountElement.textContent = `${lojaCount} lojas encontradas`;
        }
    });
}

// Função para atualizar o campo de status no Firebase baseado nos heartbeats
function atualizarStatusNoFirebase() {
    const database = firebase.database();
    
    database.ref('/').once('value', (snapshot) => {
        const lojas = snapshot.val();
        
        for (const lojaId in lojas) {
            if (typeof lojas[lojaId] === 'object') {
                const loja = lojas[lojaId];
                const heartbeat = loja.heartbeat;
                const heartbeatInterval = loja.heartbeat_interval || 180;
                
                if (heartbeat) {
                    const agora = Date.now();
                    const intervaloMs = heartbeatInterval * 1000;
                    const diferenca = agora - heartbeat;
                    
                    let online = diferenca < intervaloMs * ONLINE_THRESHOLD;
                    
                    // Caso especial para SP01
                    if (lojaId === 'SP01') {
                        // Verificar se a data do heartbeat é a mesma de hoje
                        const heartbeatDate = new Date(heartbeat);
                        const nowDate = new Date(agora);
                        const isSameDate = 
                            heartbeatDate.getFullYear() === nowDate.getFullYear() &&
                            heartbeatDate.getMonth() === nowDate.getMonth() &&
                            heartbeatDate.getDate() === nowDate.getDate();
                        
                        // Considerar online se for a mesma data para SP01
                        if (isSameDate) {
                            online = true;
                        }
                    }
                    
                    const novoStatus = online ? "Online" : "Offline";
                    const statusAtual = loja.pc_status && loja.pc_status.status;
                    
                    if (statusAtual !== novoStatus) {
                        database.ref(`/${lojaId}/pc_status`).update({
                            status: novoStatus,
                            timestamp: Date.now(),
                            lastUpdate: new Date().toISOString()
                        });
                    }
                }
            }
        }
    });
}

// Inicializar monitoramento quando o documento estiver pronto
document.addEventListener('DOMContentLoaded', function() {
    // Iniciar monitoramento de heartbeat
    monitorarHeartbeat();
    
    // Configurar atualização periódica do status no Firebase
    atualizarStatusNoFirebase();
    setInterval(atualizarStatusNoFirebase, HEARTBEAT_CHECK_INTERVAL);
});

// Modificar a função determinarStatus existente para usar o heartbeat
if (typeof window.determinarStatus === 'function') {
    const originalDeterminarStatus = window.determinarStatus;
    
    window.determinarStatus = function(loja) {
        // Se tiver heartbeat, usar ele para determinar status
        if (loja.heartbeat) {
            const intervalo = loja.heartbeat_interval || 180;
            // Obter o ID da loja do objeto, se disponível
            const lojaId = loja.id || '';
            return determinarStatusPorHeartbeat(loja.heartbeat, intervalo, lojaId);
        }
        
        // Senão, usar o status do pc_status diretamente
        if (loja.pc_status && loja.pc_status.status) {
            if (loja.pc_status.status === "Online") {
                return { status: "Online", classe: "bg-success", indicador: "status-online" };
            } else {
                return { status: "Offline", classe: "bg-danger", indicador: "status-offline" };
            }
        }
        
        // Se não houver informação suficiente, usar a função original
        return originalDeterminarStatus(loja);
    };
} 