import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

// Importações ajustadas para sua estrutura da imagem:
import DocumentList from './components/DocumentList';
import PDFReader from './components/PDFReader';
import Login from './components/Login';
import Register from './components/Register';

// --- COMPONENTE DE PROTEÇÃO (GUARDA) ---
const PrivateRoute = ({ children }) => {
    // Tenta pegar o token salvo
    const token = localStorage.getItem('token');

    // Se NÃO tem token, força ir para /login
    if (!token) {
        return <Navigate to="/login" replace />;
    }

    // Se tem token, libera o acesso
    return children;
};

function App() {
    return (
        <Router>
            <Routes>
                {/* Rotas Públicas */}
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />

                {/* Rotas Protegidas (Só entra se tiver token) */}
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

                {/* Qualquer rota desconhecida joga para login */}
                <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
        </Router>
    );
}

export default App;