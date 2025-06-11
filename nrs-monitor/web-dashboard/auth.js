// Inicializa o serviço de autenticação do Firebase
const auth = firebase.auth();

// Elementos do DOM
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const authAlert = document.getElementById('auth-alert');
const forgotPasswordLink = document.getElementById('forgot-password');

// Estado de carregamento
let isLoading = false;

// Função para mostrar erros
function showError(message) {
    authAlert.textContent = message;
    authAlert.classList.remove('d-none', 'alert-success');
    authAlert.classList.add('alert-danger');
}

// Função para mostrar sucesso
function showSuccess(message) {
    authAlert.textContent = message;
    authAlert.classList.remove('d-none', 'alert-danger');
    authAlert.classList.add('alert-success');
}

// Função para esconder alertas
function hideAlert() {
    authAlert.classList.add('d-none');
}

// Função para traduzir erros do Firebase
function translateFirebaseError(error) {
    const errorMap = {
        'auth/email-already-in-use': 'Este e-mail já está sendo usado por outra conta.',
        'auth/invalid-email': 'Endereço de e-mail inválido.',
        'auth/operation-not-allowed': 'Operação não permitida.',
        'auth/weak-password': 'A senha é muito fraca. Use pelo menos 6 caracteres.',
        'auth/user-disabled': 'Esta conta de usuário foi desativada.',
        'auth/user-not-found': 'Não há usuário com este e-mail.',
        'auth/wrong-password': 'Senha incorreta.',
        'auth/too-many-requests': 'Muitas tentativas. Tente novamente mais tarde.',
        'auth/network-request-failed': 'Erro de rede. Verifique sua conexão.',
        'auth/requires-recent-login': 'Esta operação é sensível e requer autenticação recente.',
        'auth/invalid-action-code': 'Código de ação inválido.',
        'auth/expired-action-code': 'Código de ação expirado.',
        'auth/account-exists-with-different-credential': 'Já existe uma conta com o mesmo e-mail.'
    };

    return errorMap[error.code] || error.message;
}

// Função para atualizar UI durante loading
function setLoading(loading) {
    isLoading = loading;
    
    // Atualiza botões de submit
    const buttons = document.querySelectorAll('button[type="submit"]');
    buttons.forEach(button => {
        if (loading) {
            button.disabled = true;
            button.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Processando...';
        } else {
            button.disabled = false;
            // Restaura o conteúdo original do botão dependendo do formulário
            if (button.closest('#login-form')) {
                button.innerHTML = '<i class="fas fa-sign-in-alt me-2"></i>Entrar';
            } else if (button.closest('#register-form')) {
                button.innerHTML = '<i class="fas fa-user-plus me-2"></i>Criar Conta';
            }
        }
    });
}

// Função para registrar um novo usuário
async function registerUser(name, email, password) {
    try {
        setLoading(true);
        hideAlert();
        
        // Criar usuário no Firebase
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        
        // Atualizar o perfil do usuário com o nome
        await userCredential.user.updateProfile({
            displayName: name
        });
        
        // Enviar e-mail de verificação
        await userCredential.user.sendEmailVerification();
        
        showSuccess('Conta criada com sucesso! Um e-mail de verificação foi enviado para ' + email);
        
        // Limpar o formulário
        registerForm.reset();
        
        // Mudar para a aba de login após 2 segundos
        setTimeout(() => {
            document.getElementById('login-tab').click();
        }, 2000);
        
    } catch (error) {
        console.error('Erro no registro:', error);
        showError(translateFirebaseError(error));
    } finally {
        setLoading(false);
    }
}

// Função para fazer login
async function loginUser(email, password) {
    try {
        setLoading(true);
        hideAlert();
        
        // Autenticar usuário no Firebase
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        
        // Verificar se o e-mail está verificado
        if (!userCredential.user.emailVerified) {
            // Enviar novo e-mail de verificação
            await userCredential.user.sendEmailVerification();
            
            // Deslogar usuário
            await auth.signOut();
            
            showError('Por favor, verifique seu e-mail antes de fazer login. Um novo e-mail de verificação foi enviado.');
            return;
        }
        
        // Registrar login no Firestore
        await db.collection('login_logs').add({
            userId: userCredential.user.uid,
            email: userCredential.user.email,
            displayName: userCredential.user.displayName,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        console.log('Login registrado no Firestore');
        
        // Redirecionamento para o dashboard
        window.location.href = 'index.html';
        
    } catch (error) {
        console.error('Erro no login:', error);
        showError(translateFirebaseError(error));
    } finally {
        setLoading(false);
    }
}

// Função para recuperar senha
async function resetPassword(email) {
    try {
        setLoading(true);
        hideAlert();
        
        await auth.sendPasswordResetEmail(email);
        showSuccess('E-mail de recuperação enviado para ' + email);
        
    } catch (error) {
        console.error('Erro na recuperação de senha:', error);
        showError(translateFirebaseError(error));
    } finally {
        setLoading(false);
    }
}

// Evento para formulário de registro
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (isLoading) return;
    
    const name = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-confirm-password').value;
    
    // Validação básica
    if (!name || !email || !password) {
        showError('Todos os campos são obrigatórios');
        return;
    }
    
    if (password !== confirmPassword) {
        showError('As senhas não coincidem');
        return;
    }
    
    if (password.length < 6) {
        showError('A senha deve ter pelo menos 6 caracteres');
        return;
    }
    
    await registerUser(name, email, password);
});

// Evento para formulário de login
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (isLoading) return;
    
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    
    // Validação básica
    if (!email || !password) {
        showError('E-mail e senha são obrigatórios');
        return;
    }
    
    await loginUser(email, password);
});

// Evento para link de esqueci a senha
forgotPasswordLink.addEventListener('click', async (e) => {
    e.preventDefault();
    
    if (isLoading) return;
    
    const email = document.getElementById('login-email').value.trim();
    
    if (!email) {
        showError('Digite seu e-mail no campo acima para recuperar sua senha');
        document.getElementById('login-email').focus();
        return;
    }
    
    await resetPassword(email);
});

// Verificar se o usuário já está autenticado quando a página carrega
document.addEventListener('DOMContentLoaded', () => {
    auth.onAuthStateChanged(user => {
        if (user && user.emailVerified) {
            // Usuário já está logado e verificado, redirecionar para o dashboard
            window.location.href = 'index.html';
        }
    });
}); 