// Elementos do DOM
const resetScopeFiltered = document.getElementById('resetScopeFiltered');
const resetScopeRegion = document.getElementById('resetScopeRegion');
const resetScopeState = document.getElementById('resetScopeState');
const resetRegionContainer = document.getElementById('resetRegionContainer');
const resetStateContainer = document.getElementById('resetStateContainer');
const resetRegion = document.getElementById('resetRegion');
const resetState = document.getElementById('resetState');
const resetType = document.getElementById('resetType');
const affectedStoresCount = document.getElementById('affected-stores-count');
const confirmBatchReset = document.getElementById('confirm-batch-reset');

// Lista de estados por região
const estadosPorRegiao = {
    norte: ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO'],
    nordeste: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
    'centro-oeste': ['DF', 'GO', 'MT', 'MS'],
    sudeste: ['ES', 'MG', 'RJ', 'SP'],
    sul: ['PR', 'RS', 'SC']
};

// Função para popular o select de estados
function popularEstados(regiao) {
    resetState.innerHTML = '<option value="">Selecione o estado</option>';
    const estados = estadosPorRegiao[regiao] || [];
    estados.forEach(estado => {
        const option = document.createElement('option');
        option.value = estado;
        option.textContent = estado;
        resetState.appendChild(option);
    });
}

// Função para atualizar a contagem de lojas afetadas
function atualizarContagem() {
    let count = 0;
    const scope = document.querySelector('input[name="resetScope"]:checked').value;
    
    if (scope === 'filtered') {
        // Usar as lojas atualmente filtradas na tabela
        if (window.dataTable) {
            count = window.dataTable.rows({ search: 'applied' }).count();
        }
    } else if (scope === 'region' && resetRegion.value) {
        // Contar lojas da região selecionada
        if (window.dataTable) {
            count = window.dataTable.rows().data().filter(row => {
                const estado = row[2].split('-')[0].trim(); // Assumindo que o estado está na terceira coluna
                return estadosPorRegiao[resetRegion.value].includes(estado);
            }).length;
        }
    } else if (scope === 'state' && resetState.value) {
        // Contar lojas do estado selecionado
        if (window.dataTable) {
            count = window.dataTable.rows().data().filter(row => {
                const estado = row[2].split('-')[0].trim(); // Assumindo que o estado está na terceira coluna
                return estado === resetState.value;
            }).length;
        }
    }
    
    affectedStoresCount.textContent = count > 0 ? `${count} loja${count > 1 ? 's' : ''}` : 'Nenhuma loja';
}

// Event Listeners
document.querySelectorAll('input[name="resetScope"]').forEach(radio => {
    radio.addEventListener('change', function() {
        resetRegionContainer.style.display = this.value === 'region' ? 'block' : 'none';
        resetStateContainer.style.display = this.value === 'state' ? 'block' : 'none';
        atualizarContagem();
    });
});

resetRegion.addEventListener('change', function() {
    popularEstados(this.value);
    atualizarContagem();
});

resetState.addEventListener('change', atualizarContagem);

// Executar reset em lote
confirmBatchReset.addEventListener('click', async function() {
    const scope = document.querySelector('input[name="resetScope"]:checked').value;
    const type = resetType.value;
    let lojas = [];
    
    // Coletar lojas baseado no escopo selecionado
    if (scope === 'filtered' && window.dataTable) {
        lojas = window.dataTable.rows({ search: 'applied' }).data().map(row => row[2]);
    } else if (scope === 'region' && resetRegion.value) {
        lojas = window.dataTable.rows().data()
            .filter(row => {
                const estado = row[2].split('-')[0].trim();
                return estadosPorRegiao[resetRegion.value].includes(estado);
            })
            .map(row => row[2]);
    } else if (scope === 'state' && resetState.value) {
        lojas = window.dataTable.rows().data()
            .filter(row => {
                const estado = row[2].split('-')[0].trim();
                return estado === resetState.value;
            })
            .map(row => row[2]);
    }
    
    if (lojas.length === 0) {
        Swal.fire({
            icon: 'warning',
            title: 'Nenhuma loja selecionada',
            text: 'Selecione pelo menos uma loja para executar o reset.'
        });
        return;
    }
    
    // Confirmar a operação
    const result = await Swal.fire({
        icon: 'warning',
        title: 'Confirmar Reset em Lote',
        html: `
            <p>Você está prestes a ${type === 'restart' ? 'reiniciar' : 'desligar'} os totens das seguintes lojas:</p>
            <ul style="text-align: left; max-height: 200px; overflow-y: auto;">
                ${lojas.map(loja => `<li>${loja}</li>`).join('')}
            </ul>
            <p class="mt-3">Esta operação não pode ser desfeita.</p>
        `,
        showCancelButton: true,
        confirmButtonText: 'Sim, executar reset',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#dc3545',
        reverseButtons: true
    });
    
    if (result.isConfirmed) {
        try {
            // Aqui você implementaria a lógica real de reset
            // Por enquanto, apenas simularemos o sucesso
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            Swal.fire({
                icon: 'success',
                title: 'Reset executado com sucesso',
                text: `${lojas.length} loja(s) foram afetadas.`
            });
            
            // Fechar o modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('batchResetModal'));
            modal.hide();
        } catch (error) {
            console.error('Erro ao executar reset:', error);
            Swal.fire({
                icon: 'error',
                title: 'Erro ao executar reset',
                text: 'Ocorreu um erro ao tentar executar o reset. Tente novamente.'
            });
        }
    }
}); 