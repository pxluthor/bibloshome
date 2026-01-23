import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import { UserPlus, User, Lock, Mail } from 'lucide-react';

const Register = () => {
    const [formData, setFormData] = useState({ nome: '', email: '', senha: '', is_admin: false });
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData({ 
            ...formData, 
            [name]: type === 'checkbox' ? checked : value 
        });
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
                    <div className="text-3xl font-bold mb-2">
                        <span className="text-blue-600">Library</span><span className="text-green-600">Anywhere</span>
                    </div>
                    <p className="text-gray-800 text-lg font-semibold">Crie sua conta</p>
                    <p className="text-gray-500">Registre-se para ler de qualquer lugar</p>
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
                    {/*<div>
                        <label className="block text-gray-700 text-sm font-bold mb-2">Tipo de Conta</label>
                        <div className="flex items-center gap-3">
                            <input
                                name="is_admin"
                                type="checkbox"
                                checked={formData.is_admin}
                                onChange={handleChange}
                                className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <span className="text-gray-700">Desejo ser administrador</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Administradores podem gerenciar pedidos de livros</p>
                    </div>*/}
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
