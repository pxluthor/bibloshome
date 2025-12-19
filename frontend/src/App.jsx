import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import api from './services/api'; // Importando sua API configurada

// Importações dos componentes
import DocumentList from './components/DocumentList';
import PDFReader from './components/PDFReader';
import Login from './components/Login';
import Register from './components/Register';

// --- COMPONENTE DE PROTEÇÃO (GUARDA) REFORMULADO ---
const PrivateRoute = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(null); // null = carregando
    const token = localStorage.getItem('token');

    useEffect(() => {
        const verifyAuth = async () => {
            if (!token) {
                setIsAuthenticated(false);
                return;
            }
            

            try {
                // Chama o novo endpoint de verificação
                await api.get('/auth/verify');
                setIsAuthenticated(true);
            } catch (error) {
                // Se o token for inválido ou expirado (Erro 401)
                console.error("Token inválido ou expirado");
                localStorage.clear(); // Limpa o lixo do storage
                setIsAuthenticated(false);
            }
        };

        verifyAuth();
    }, [token]);

    // Enquanto está verificando, mostramos uma tela de carregamento ou nada
    if (isAuthenticated === null) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    // Se não estiver autenticado, manda para o login
    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    // Se estiver tudo ok, libera o acesso aos filhos (DocumentList ou PDFReader)
    return children;
};

function App() {
    return (
        <Router>
            <Routes>
                {/* Rotas Públicas */}
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />

                {/* Rotas Protegidas */}
                <Route
                    path="/"
                    element={
                        <PrivateRoute>
                            <DocumentList />
                        </PrivateRoute>
                    }
                />

                <Route
                    path="/document/:id"
                    element={
                        <PrivateRoute>
                            <PDFReader />
                        </PrivateRoute>
                    }
                />

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
        </Router>
    );
}

export default App;