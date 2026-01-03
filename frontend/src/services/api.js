import axios from 'axios';

// Configuração base da API
const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'https://api.library.pxluthor.com.br',
    withCredentials: true, // Essencial para Cookies HttpOnly
});

// INTERCEPTOR DE REQUISIÇÃO: Adiciona o token se existir
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, (error) => {
    return Promise.reject(error);
});

// INTERCEPTOR DE RESPOSTA: Gestão global de erros (Segurança)
api.interceptors.response.use(
    (response) => response,
    (error) => {
        // Se receber 401 (Não Autorizado), limpa o acesso e expulsa o utilizador
        if (error.response && error.response.status === 401) {
            localStorage.clear();
            window.location.href = '/login'; // Redirecionamento forçado por segurança
        }
        return Promise.reject(error);
    }
);

export default api;