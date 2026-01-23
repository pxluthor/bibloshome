import React, { useState } from 'react';
import api from '../services/api';
import { useNavigate, Link } from 'react-router-dom';
import { LogIn, Lock, Mail } from 'lucide-react';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const response = await api.post('/auth/login', {
                email,
                senha: password
            });

            // Salvar token e dados do usuário
            localStorage.setItem('token', response.data.access_token);
            localStorage.setItem('userName', response.data.user_name);
            localStorage.setItem('userId', response.data.user_id);
            localStorage.setItem('isAdmin', response.data.is_admin);

            // Redirecionar para home
            navigate('/');
        } catch (err) {
            setError('Email ou senha inválidos');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-lg shadow-2xl p-8">
                <div className="text-center mb-8">
                    <div className="text-3xl font-bold mb-2">
                        <span className="text-blue-600">Library</span><span className="text-green-600">Anywhere</span>
                    </div>
                    <p className="text-gray-800 text-lg font-semibold">Seja bem vindo</p>
                    <p className="text-gray-400">Entre para acessar seus livros de qualquer lugar</p>
                </div>

                {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4 text-sm">{error}</div>}

                <form onSubmit={handleLogin} className="space-y-6">
                    <div>
                        <label className="block text-gray-700 text-sm font-bold mb-2">Email</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-3 text-gray-400" size={20} />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                placeholder="seu@email.com"
                                required
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-gray-700 text-sm font-bold mb-2">Senha</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-3 text-gray-400" size={20} />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                placeholder="••••••••"
                                required
                            />
                        </div>
                    </div>
                    <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded font-bold hover:bg-blue-700 transition flex items-center justify-center gap-2">
                        <LogIn size={20} /> Entrar
                    </button>
                </form>
                <div className="mt-6 text-center text-sm text-gray-600">
                    Não tem uma conta? <Link to="/register" className="text-blue-600 font-bold hover:underline">Cadastre-se</Link>
                </div>
            </div>
        </div>
    );
};

export default Login;
