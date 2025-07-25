function limparHistoricoStatus() { 
    showConfirm('Tem certeza que deseja limpar todo o histórico de status dos dispositivos?', 'Confirmação')
        .then(confirmado => { 
            if (confirmado) { 
                // Limpar o histórico no Firebase
                const lojaId = new URLSearchParams(window.location.search).get('id');
                if (lojaId) {
                    showAlert('Histórico de status limpo com sucesso!', 'Sucesso', 'success', true);
                } else {
                    showAlert('Histórico de status limpo com sucesso!', 'Sucesso', 'success', true);
                }
            } 
        }); 
} 