// Inicializa o serviço de autenticação do Firebase
const auth = firebase.auth();

// Elementos do DOM para o perfil do usuário - serão inicializados após carregamento da página
let userNameElement;
let userDisplayNameElement;
let userEmailElement;
let logoutButton;
let changePasswordButton;
let userProfileButton;

// Elementos do DOM para o modal de perfil - serão inicializados após carregamento da página
let profileModal;
let profileForm;
let profileName;
let profileEmail;
let saveProfileButton;
let profileAlert;

// Elementos do DOM para o modal de senha - serão inicializados após carregamento da página
let passwordModal;
let passwordEmail;
let sendPasswordResetButton;

// Variável para armazenar o usuário atual
let currentUser = null;

// Função para mostrar alertas de erro no perfil
function showProfileError(message) {
    profileAlert.textContent = message;
    profileAlert.classList.remove('d-none', 'alert-success');
    profileAlert.classList.add('alert-danger');
}

// Função para mostrar alertas de sucesso no perfil
function showProfileSuccess(message) {
    profileAlert.textContent = message;
    profileAlert.classList.remove('d-none', 'alert-danger');
    profileAlert.classList.add('alert-success');
}

// Função para esconder alertas no perfil
function hideProfileAlert() {
    profileAlert.classList.add('d-none');
}

// Função para traduzir erros do Firebase
function translateFirebaseError(error) {
    const errorMap = {
        'auth/requires-recent-login': 'Esta operação é sensível e requer autenticação recente. Faça login novamente antes de tentar novamente.',
        'auth/invalid-email': 'O endereço de e-mail é inválido.',
        'auth/email-already-in-use': 'O endereço de e-mail já está sendo usado por outra conta.',
        'auth/user-not-found': 'Não há usuário com este e-mail.',
        'auth/user-disabled': 'Esta conta de usuário foi desativada.',
        'auth/network-request-failed': 'Ocorreu um erro de rede. Verifique sua conexão com a internet.',
        'auth/weak-password': 'A senha deve ter pelo menos 6 caracteres.'
    };

    return errorMap[error.code] || error.message;
}

// Função para verificar se o usuário está autenticado
function checkAuth() {
    auth.onAuthStateChanged(user => {
        if (user && user.emailVerified) {
            // Usuário está autenticado e verificado
            console.log('Usuário autenticado:', user);
            currentUser = user;
            
            // Registrar login no Firestore
            db.collection('login_logs').add({
                userId: user.uid,
                email: user.email,
                displayName: user.displayName,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            }).then(() => {
                console.log('Login registrado no Firestore');
            }).catch(error => {
                console.error('Erro ao registrar login no Firestore:', error);
            });
            
            // Atualiza a interface com os dados do usuário
            updateUserInterface(user);
            
            // Se estiver na página de login, redireciona para o dashboard
            if (window.location.pathname.includes('login.html')) {
                window.location.href = 'index.html';
            }
        } else {
            // Usuário não está autenticado ou o e-mail não está verificado
            console.log('Usuário não autenticado ou e-mail não verificado');
            
            // Se não estiver na página de login, redireciona para lá
            if (!window.location.pathname.includes('login.html')) {
                window.location.href = 'login.html';
            }
        }
    });
}

// Adiciona um listener global para estado de autenticação
auth.onAuthStateChanged(user => {
    if (user && user.emailVerified) {
        currentUser = user;
        
        // Inicializa os elementos e atualiza a interface se a página já estiver carregada
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            initializeElements();
            updateUserInterface(user);
        }
    }
});

// Função para atualizar a interface com os dados do usuário
function updateUserInterface(user) {
    console.log('Atualizando interface com dados do usuário:', user.displayName || user.email);
    
    // Verifica se os elementos existem antes de tentar atualizá-los
    // Nome de usuário no cabeçalho
    if (userNameElement) {
        userNameElement.textContent = user.displayName || 'Usuário';
    }
    
    // Nome de usuário no dropdown - não exibir erro se não existir
    if (userDisplayNameElement) {
        userDisplayNameElement.textContent = user.displayName || 'Usuário';
    }
    
    // Email no dropdown
    if (userEmailElement) {
        userEmailElement.textContent = user.email;
    }
    
    // Perfil - nome
    if (profileName) {
        profileName.value = user.displayName || '';
    }
    
    // Perfil - email
    if (profileEmail) {
        profileEmail.value = user.email;
    }
    
    // Modal de senha - email
    if (passwordEmail) {
        passwordEmail.value = user.email;
    }
}

// Função para fazer logout
async function logout() {
    try {
        await auth.signOut();
        // O redirecionamento para login.html será feito pelo checkAuth()
    } catch (error) {
        console.error('Erro ao fazer logout:', error);
        alert('Erro ao fazer logout: ' + error.message);
    }
}

// Função para atualizar o perfil do usuário
async function updateProfile(name) {
    try {
        // Verifica se o usuário está autenticado
        if (!currentUser) {
            throw new Error('Usuário não autenticado');
        }
        
        // Atualiza o nome de exibição
        await currentUser.updateProfile({
            displayName: name
        });
        
        // Atualiza a interface
        updateUserInterface(currentUser);
        
        showProfileSuccess('Perfil atualizado com sucesso!');
        
        // Fecha o modal após 1,5 segundos
        setTimeout(() => {
            profileModal.hide();
            hideProfileAlert();
        }, 1500);
        
    } catch (error) {
        console.error('Erro ao atualizar perfil:', error);
        showProfileError(translateFirebaseError(error));
    }
}

// Função para enviar e-mail de redefinição de senha
async function sendPasswordReset(email) {
    try {
        await auth.sendPasswordResetEmail(email);
        alert('E-mail de redefinição de senha enviado para ' + email);
        passwordModal.hide();
    } catch (error) {
        console.error('Erro ao enviar e-mail de redefinição de senha:', error);
        alert('Erro: ' + translateFirebaseError(error));
    }
}

// Eventos
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM totalmente carregado');
    
    // Inicializa as referências aos elementos DOM
    initializeElements();
    
    // Verifica autenticação quando a página carregar
    checkAuth();
    
    // Evento de logout
    if (logoutButton) {
        logoutButton.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    }
    
    // Evento para abrir modal de perfil
    if (userProfileButton) {
        userProfileButton.addEventListener('click', (e) => {
            e.preventDefault();
            hideProfileAlert();
            profileModal.show();
        });
    }
    
    // Evento para salvar alterações no perfil
    if (saveProfileButton) {
        saveProfileButton.addEventListener('click', () => {
            const name = profileName.value.trim();
            
            // Validação básica
            if (!name) {
                showProfileError('O nome não pode estar vazio');
                return;
            }
            
            updateProfile(name);
        });
    }
    
    // Evento para abrir modal de alteração de senha
    if (changePasswordButton) {
        changePasswordButton.addEventListener('click', (e) => {
            e.preventDefault();
            passwordModal.show();
        });
    }
    
    // Evento para enviar e-mail de redefinição de senha
    if (sendPasswordResetButton) {
        sendPasswordResetButton.addEventListener('click', () => {
            const email = passwordEmail.value.trim();
            
            // Validação básica
            if (!email) {
                alert('E-mail inválido');
                return;
            }
            
            sendPasswordReset(email);
        });
    }
});

// Função para inicializar as referências aos elementos DOM
function initializeElements() {
    // Elementos do DOM para o perfil do usuário
    userNameElement = document.getElementById('user-name');
    userDisplayNameElement = document.getElementById('user-display-name');
    userEmailElement = document.getElementById('user-email');
    logoutButton = document.getElementById('logout-btn');
    changePasswordButton = document.getElementById('change-password');
    userProfileButton = document.getElementById('user-profile');

    // Elementos do DOM para o modal de perfil
    const profileModalElement = document.getElementById('profileModal');
    if (profileModalElement) {
        profileModal = new bootstrap.Modal(profileModalElement);
    }
    
    profileForm = document.getElementById('profile-form');
    profileName = document.getElementById('profile-name');
    profileEmail = document.getElementById('profile-email');
    saveProfileButton = document.getElementById('save-profile');
    profileAlert = document.getElementById('profile-alert');

    // Elementos do DOM para o modal de senha
    const passwordModalElement = document.getElementById('passwordModal');
    if (passwordModalElement) {
        passwordModal = new bootstrap.Modal(passwordModalElement);
    }
    
    passwordEmail = document.getElementById('password-email');
    sendPasswordResetButton = document.getElementById('send-password-reset');
    
    console.log('Elementos da interface inicializados:', 
                'userNameElement:', !!userNameElement,
                'userDisplayNameElement:', !!userDisplayNameElement);
    
    // Se o usuário já estiver carregado, atualiza a interface imediatamente
    if (currentUser) {
        updateUserInterface(currentUser);
    }
} 