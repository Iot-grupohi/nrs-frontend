// Funções para registrar logs no Firestore

// Controle de operações recentes para evitar duplicações
const operacoesRecentes = new Map();

/**
 * Registra operações no Firestore
 * @param {string} tipoOperacao - Tipo de operação (liberacao_lavadora, acionamento_dosadora, reset)
 * @param {object} dados - Dados da operação
 * @returns {Promise} - Promise com o resultado da operação
 */
function registrarOperacao(tipoOperacao, dados) {
    // Verificar se o Firestore está inicializado
    if (!firebase.firestore) {
        console.error('Firestore não inicializado');
        return Promise.reject(new Error('Firestore não inicializado'));
    }
    
    // Obter usuário atual
    const usuario = firebase.auth().currentUser;
    if (!usuario) {
        console.error('Usuário não autenticado');
        return Promise.reject(new Error('Usuário não autenticado'));
    }
    
    // Dados base para todos os tipos de operação
    const dadosBase = {
        userId: usuario.uid,
        email: usuario.email,
        displayName: usuario.displayName,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        tipoOperacao: tipoOperacao
    };
    
    // Merge com os dados específicos da operação
    const dadosCompletos = { ...dadosBase, ...dados };
    
    // Registrar no Firestore
    return firebase.firestore()
        .collection('operacoes_logs')
        .add(dadosCompletos)
        .then(() => {
            console.log(`Operação ${tipoOperacao} registrada com sucesso`);
            return true;
        })
        .catch(error => {
            console.error(`Erro ao registrar operação ${tipoOperacao}:`, error);
            return Promise.reject(error);
        });
}

/**
 * Gera uma chave única para a operação
 * @param {string} tipoOperacao - Tipo de operação
 * @param {object} params - Parâmetros da operação
 * @returns {string} - Chave única
 */
function gerarChaveOperacao(tipoOperacao, params) {
    // Cria uma chave única baseada no tipo de operação e parâmetros relevantes
    let chave = `${tipoOperacao}|`;
    
    // Adiciona parâmetros específicos por tipo de operação
    if (tipoOperacao === 'liberacao_lavadora') {
        const { lojaId, lavadoraId, configuracao } = params;
        chave += `${lojaId}|${lavadoraId}|`;
        
        // Adiciona configuração específica se existir
        if (configuracao) {
            if (configuracao.amaciante !== undefined) {
                chave += `am:${configuracao.amaciante}|`;
            }
            if (configuracao.dosagem !== undefined) {
                chave += `dos:${configuracao.dosagem}|`;
            }
        }
    } else if (tipoOperacao === 'liberacao_secadora') {
        const { lojaId, secadoraId, configuracao } = params;
        chave += `${lojaId}|${secadoraId}|`;
        
        // Adiciona tempo se existir
        if (configuracao && configuracao.tempo) {
            chave += `tempo:${configuracao.tempo}|`;
        }
    } else if (tipoOperacao === 'acionamento_dosadora') {
        const { lojaId, dosadoraId, configuracao } = params;
        chave += `${lojaId}|${dosadoraId}|`;
        
        // Adiciona configuração específica se existir
        if (configuracao && configuracao.bomba !== undefined) {
            chave += `bomba:${configuracao.bomba}|`;
        }
    } else {
        // Para outros tipos, apenas usar os parâmetros como string
        chave += JSON.stringify(params);
    }
    
    return chave;
}

/**
 * Verifica se uma operação foi realizada recentemente (debounce)
 * @param {string} tipoOperacao - Tipo de operação
 * @param {object} params - Parâmetros da operação
 * @returns {boolean} - true se a operação foi realizada recentemente
 */
function operacaoRecente(tipoOperacao, params) {
    const chave = gerarChaveOperacao(tipoOperacao, params);
    
    // Verifica se a operação foi realizada nos últimos segundos
    if (operacoesRecentes.has(chave)) {
        const ultimaExecucao = operacoesRecentes.get(chave);
        const agora = Date.now();
        const tempoDecorrido = agora - ultimaExecucao;
        
        // Se a última execução foi há menos de 10 segundos, considera recente
        if (tempoDecorrido < 10000) {
            console.log(`Operação ${tipoOperacao} ignorada (debounce): última execução há ${tempoDecorrido}ms`);
            return true;
        }
    }
    
    // Registra esta operação no mapa de operações recentes
    operacoesRecentes.set(chave, Date.now());
    
    // Limpar entradas antigas periodicamente para evitar vazamento de memória
    if (operacoesRecentes.size > 100) {
        const agora = Date.now();
        for (const [k, timestamp] of operacoesRecentes.entries()) {
            if (agora - timestamp > 60000) { // Remove entradas com mais de 1 minuto
                operacoesRecentes.delete(k);
            }
        }
    }
    
    return false;
}

/**
 * Registra liberação de lavadora
 * @param {string} lojaId - ID da loja
 * @param {string} lavadoraId - ID da lavadora
 * @param {object} configuracao - Configuração da liberação (amaciante, dosagem)
 * @returns {Promise}
 */
function registrarLiberacaoLavadora(lojaId, lavadoraId, configuracao) {
    const params = { lojaId, lavadoraId, configuracao };
    
    // Verificar se esta operação foi realizada recentemente
    if (operacaoRecente('liberacao_lavadora', params)) {
        // Retorna uma Promise resolvida para manter a interface consistente
        console.log(`Evitando registro duplicado para lavadora ${lavadoraId}`);
        return Promise.resolve(true);
    }
    
    // Se não foi recente, registra normalmente
    return registrarOperacao('liberacao_lavadora', params);
}

/**
 * Registra liberação de secadora
 * @param {string} lojaId - ID da loja
 * @param {string} secadoraId - ID da secadora
 * @param {object} configuracao - Configuração da liberação (tempo)
 * @returns {Promise}
 */
function registrarLiberacaoSecadora(lojaId, secadoraId, configuracao) {
    const params = { lojaId, secadoraId, configuracao };
    
    // Verificar se esta operação foi realizada recentemente
    if (operacaoRecente('liberacao_secadora', params)) {
        // Retorna uma Promise resolvida para manter a interface consistente
        console.log(`Evitando registro duplicado para secadora ${secadoraId}`);
        return Promise.resolve(true);
    }
    
    // Se não foi recente, registra normalmente
    return registrarOperacao('liberacao_secadora', params);
}

/**
 * Registra acionamento de dosadora
 * @param {string} lojaId - ID da loja
 * @param {string} dosadoraId - ID da dosadora
 * @param {object} configuracao - Configuração do acionamento (produto, tempo)
 * @returns {Promise}
 */
function registrarAcionamentoDosadora(lojaId, dosadoraId, configuracao) {
    const params = { lojaId, dosadoraId, configuracao };
    
    // Verificar se esta operação foi realizada recentemente
    if (operacaoRecente('acionamento_dosadora', params)) {
        // Retorna uma Promise resolvida para manter a interface consistente
        console.log(`Evitando registro duplicado para dosadora ${dosadoraId}`);
        return Promise.resolve(true);
    }
    
    // Se não foi recente, registra normalmente
    return registrarOperacao('acionamento_dosadora', params);
}

/**
 * Registra reset
 * @param {string} lojaId - ID da loja
 * @param {string} tipo - Tipo de reset (Reset ON, Reset OFF)
 * @returns {Promise}
 */
function registrarReset(lojaId, tipo) {
    const params = { lojaId, operacao: tipo };
    
    // Verificar se esta operação foi realizada recentemente
    if (operacaoRecente('reset', params)) {
        // Retorna uma Promise resolvida para manter a interface consistente
        console.log(`Evitando registro duplicado para reset de ${lojaId}`);
        return Promise.resolve(true);
    }
    
    // Se não foi recente, registra normalmente
    return registrarOperacao('reset', params);
}

/**
 * Registra reset em lote
 * @param {object} configuracao - Configuração do reset em lote (escopo, tipo, lojasAfetadas)
 * @returns {Promise}
 */
function registrarResetEmLote(configuracao) {
    // Para reset em lote não aplicamos debounce, pois é uma operação raramente repetida
    return registrarOperacao('reset_em_lote', configuracao);
} 