/**
 * CEP Loader - Importa funções da lojas.js para carregamento de CEP
 * Este arquivo serve como bridge para garantir que a funcionalidade de exibição do CEP
 * esteja disponível na página da loja.
 */

// Só define as funções se elas ainda não existirem
if (typeof buscarInfoLoja !== 'function') {
    // Função para buscar informações da loja pela API externa
    async function buscarInfoLoja(codigo) {
        try {
            // Endpoint da API
            const url = `https://sistema.lavanderia60minutos.com.br/api/v1/stores/${codigo}`;
            
            // Configuração da requisição
            const opcoes = {
                method: 'GET',
                headers: {
                    'X-Token': '1be10a9c20528183b64e3c69564db6958eab7f434ee94350706adb4efc261869',
                    'Content-Type': 'application/json'
                }
            };
            
            console.log(`[Fallback] Buscando informações da loja ${codigo}...`);
            
            // Fazer a requisição
            const resposta = await fetch(url, opcoes);
            
            // Verificar se a requisição foi bem-sucedida
            if (!resposta.ok) {
                console.error(`[Fallback] Erro na requisição: ${resposta.status} - ${resposta.statusText}`);
                throw new Error(`Erro na requisição: ${resposta.status} - ${resposta.statusText}`);
            }
            
            // Converter a resposta para JSON
            const dados = await resposta.json();
            
            // Log da resposta completa para debug
            console.log("[Fallback] Resposta completa da API:", dados);
            
            // Verificar se a estrutura da resposta está correta
            if (!dados || !dados.data) {
                console.error("[Fallback] Estrutura da resposta inválida:", dados);
                throw new Error("Estrutura da resposta inválida");
            }
            
            // Extrair o zipcode (CEP) do caminho correto na estrutura de dados
            const zipcode = dados.data?.attributes?.zipcode || dados.data?.zipcode || 'Não informado';
            
            // Formatar o CEP no padrão brasileiro (00000-000)
            let cepFormatado = zipcode;
            if (zipcode && zipcode.length === 8) {
                cepFormatado = `${zipcode.substring(0, 5)}-${zipcode.substring(5)}`;
            }
            
            console.log(`[Fallback] CEP da loja ${codigo}: ${cepFormatado}`);
            return cepFormatado;
        } catch (erro) {
            console.error(`[Fallback] Erro ao buscar informações da loja ${codigo}:`, erro);
            return 'Não informado';
        }
    }
}

// Só define a função se ela ainda não existir
if (typeof exibirCEPLoja !== 'function') {
    // Função para atualizar a interface com o CEP da loja
    function exibirCEPLoja(codigo, elementoDestino) {
        // Elemento onde o CEP será exibido (pode ser passado como parâmetro)
        const elemento = document.querySelector(elementoDestino);
        if (!elemento) {
            console.error(`[Fallback] Elemento ${elementoDestino} não encontrado`);
            return;
        }
        
        // Mostrar carregando
        elemento.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Buscando CEP...';
        
        // Buscar o CEP
        buscarInfoLoja(codigo)
            .then(zipcode => {
                if (zipcode && zipcode !== 'Não informado') {
                    // Exibir apenas o CEP
                    elemento.innerHTML = `<i class="fas fa-map-marker-alt me-2"></i>CEP: <span class="badge bg-light text-dark border">${zipcode}</span>`;
                } else {
                    // Exibir mensagem de erro
                    elemento.innerHTML = '<i class="fas fa-exclamation-triangle me-2 text-warning"></i>CEP: <span class="text-muted">Não informado</span>';
                }
            })
            .catch(erro => {
                console.error('[Fallback] Erro ao exibir CEP:', erro);
                elemento.innerHTML = '<i class="fas fa-exclamation-triangle me-2 text-warning"></i>CEP: <span class="text-muted">Não disponível</span>';
            });
    }
} 