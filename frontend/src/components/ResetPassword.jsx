import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { KeyRound, Loader2 } from 'lucide-react';
import api from '../services/api';
import { toast } from '../utils/toast';
import { PasswordField } from './Login';

// Public page opened from the one-time link an admin generates in Admin BD > Usuários.
export default function ResetPassword() {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const token = params.get('token') || '';
    const [senha, setSenha] = useState('');
    const [confirma, setConfirma] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        if (senha !== confirma) {
            setError('As senhas não conferem.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            await api.post('/auth/reset-password', { token, senha });
            toast.success('Senha redefinida! Faça login.');
            navigate('/login', { replace: true });
        } catch (err) {
            setError(err.response?.data?.detail || 'Não foi possível redefinir a senha.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
            <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-white shadow-xl p-6 space-y-4">
                <div className="flex flex-col items-center gap-2 text-center">
                    <span className="bg-blue-600 text-white p-2.5 rounded-xl"><KeyRound size={22} /></span>
                    <h1 className="text-xl font-bold text-gray-900">Redefinir senha</h1>
                    <p className="text-sm text-gray-500">Escolha uma nova senha (mínimo de 6 caracteres).</p>
                </div>
                {!token && <p role="alert" className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">Link incompleto. Peça um novo ao administrador.</p>}
                {error && <p role="alert" className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>}
                <div className="space-y-1.5">
                    <label htmlFor="nova-senha" className="block text-sm font-semibold text-gray-800">Nova senha</label>
                    <PasswordField id="nova-senha" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" />
                </div>
                <div className="space-y-1.5">
                    <label htmlFor="confirma-senha" className="block text-sm font-semibold text-gray-800">Confirmar senha</label>
                    <PasswordField id="confirma-senha" value={confirma} onChange={(e) => setConfirma(e.target.value)} autoComplete="new-password" />
                </div>
                <button
                    type="submit"
                    disabled={loading || !token}
                    className="w-full h-12 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition flex items-center justify-center gap-2"
                >
                    {loading && <Loader2 size={16} className="animate-spin" />}
                    Salvar nova senha
                </button>
            </form>
        </div>
    );
}
