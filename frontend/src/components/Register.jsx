import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import { UserPlus, User, Lock, Mail } from 'lucide-react';

const Register = () => {
    const [formData, setFormData] = useState({ nome: '', email: '', senha: '' });
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        try {
            await axios.post('https://api-library.pxluthor.com.br/auth/register', formData);
            alert("Cadastro realizado com sucesso! Faça login.");
            navigate('/login');
        } catch (err) {
            setError(err.response?.data?.detail || 'Erro ao cadastrar');
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-lg shadow-2xl p-8">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-800">Criar Conta</h1>
                    <p className="text-gray-500">Comece sua jornada de leitura</p>
                </div>

                {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4 text-sm">{error}</div>}

                <form onSubmit={handleRegister} className="space-y-4">
                    <div>
                        <label className="block text-gray-700 text-sm font-bold mb-2">Nome</label>
                        <div className="relative">
                            <User className="absolute left-3 top-3 text-gray-400" size={20} />
                            <input
                                name="nome"
                                type="text"
                                onChange={handleChange}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                placeholder="Seu Nome"
                                required
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-gray-700 text-sm font-bold mb-2">Email</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-3 text-gray-400" size={20} />
                            <input
                                name="email"
                                type="email"
                                onChange={handleChange}
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
                                name="senha"
                                type="password"
                                onChange={handleChange}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                placeholder="Mínimo 6 caracteres"
                                required
                            />
                        </div>
                    </div>
                    <button type="submit" className="w-full bg-green-600 text-white py-3 rounded font-bold hover:bg-green-700 transition flex items-center justify-center gap-2 mt-6">
                        <UserPlus size={20} /> Cadastrar
                    </button>
                </form>
                <div className="mt-6 text-center text-sm text-gray-600">
                    Já tem uma conta? <Link to="/login" className="text-blue-600 font-bold hover:underline">Fazer Login</Link>
                </div>
            </div>
        </div>
    );
};

export default Register;