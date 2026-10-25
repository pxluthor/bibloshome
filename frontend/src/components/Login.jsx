import React, { useState } from 'react';
import { takeReturnPath } from '../utils/navigation';
import api from '../services/api';
import { useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Library, Loader2 } from 'lucide-react';
import { toast } from '../utils/toast';

// Login + cadastro num único cartão: no desktop o painel colorido desliza entre os dois formulários.

const inputClass = 'w-full h-12 rounded-xl bg-gray-100 px-4 text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500';

export const PasswordField = ({ id, value, onChange, autoComplete, placeholder = '••••••••' }) => {
    const [show, setShow] = useState(false);
    return (
        <div className="relative">
            <input
                id={id}
                type={show ? 'text' : 'password'}
                value={value}
                onChange={onChange}
                autoComplete={autoComplete}
                placeholder={placeholder}
                required
                minLength={6}
                className={`${inputClass} pr-12`}
            />
            <button
                type="button"
                onClick={() => setShow((prev) => !prev)}
                aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
                aria-pressed={show}
                className="absolute right-2 top-1/2 -translate-y-1/2 grid place-items-center w-9 h-9 rounded-lg text-gray-400 hover:text-gray-700"
            >
                {show ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
        </div>
    );
};

const Field = ({ id, label, children }) => (
    <div className="space-y-1.5">
        <label htmlFor={id} className="block text-sm font-semibold text-gray-800">{label}</label>
        {children}
    </div>
);

const SubmitButton = ({ loading, children }) => (
    <button
        type="submit"
        disabled={loading}
        className="w-full h-12 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition flex items-center justify-center gap-2"
    >
        {loading && <Loader2 size={16} className="animate-spin" />}
        {children}
    </button>
);

const ErrorBox = ({ message }) => message ? (
    <p role="alert" className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{message}</p>
) : null;

const Login = ({ initialMode = 'login' }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [mode, setMode] = useState(location.pathname.startsWith('/register') ? 'register' : initialMode);
    const isRegister = mode === 'register';

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loginError, setLoginError] = useState('');
    const [loginLoading, setLoginLoading] = useState(false);
    const [showForgot, setShowForgot] = useState(false);

    const [reg, setReg] = useState({ nome: '', email: '', senha: '' });
    const [regError, setRegError] = useState('');
    const [regLoading, setRegLoading] = useState(false);

    const switchTo = (next) => {
        setMode(next);
        setLoginError('');
        setRegError('');
        window.history.replaceState(null, '', next === 'register' ? '/register' : '/login');
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoginLoading(true);
        setLoginError('');
        try {
            const response = await api.post('/auth/login', { email, senha: password });
            localStorage.setItem('token', response.data.access_token);
            localStorage.setItem('userName', response.data.user_name);
            localStorage.setItem('userId', response.data.user_id);
            localStorage.setItem('isAdmin', response.data.is_admin);
            // Volta para a tela onde a sessão expirou (ou home)
            navigate(takeReturnPath('/'), { replace: true });
        } catch (err) {
            setLoginError(err.response?.status === 403 ? err.response.data.detail : 'Email ou senha inválidos');
        } finally {
            setLoginLoading(false);
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setRegLoading(true);
        setRegError('');
        try {
            await api.post('/auth/register', reg);
            toast.success('Cadastro realizado! Faça login.');
            setEmail(reg.email);
            setPassword('');
            setReg({ nome: '', email: '', senha: '' });
            switchTo('login');
        } catch (err) {
            setRegError(err.response?.data?.detail || 'Erro ao cadastrar');
        } finally {
            setRegLoading(false);
        }
    };

    const loginForm = (
        <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4" aria-label="Entrar">
            <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">Entrar</h1>
            <ErrorBox message={loginError} />
            <Field id="login-email" label="Email">
                <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email" placeholder="seu@email.com" required className={inputClass} />
            </Field>
            <Field id="login-senha" label="Senha">
                <PasswordField id="login-senha" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </Field>
            <div className="text-right -mt-1">
                <button type="button" onClick={() => setShowForgot((v) => !v)} className="text-xs font-semibold text-blue-600 hover:underline">
                    Esqueci minha senha
                </button>
            </div>
            {showForgot && (
                <p className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800">
                    Peça ao administrador da biblioteca um link de redefinição de senha. O link vale por 24 horas.
                </p>
            )}
            <SubmitButton loading={loginLoading}>Entrar</SubmitButton>
            <p className="md:hidden text-center text-sm text-gray-600">
                Não tem conta? <button type="button" onClick={() => switchTo('register')} className="font-semibold text-blue-600">Cadastre-se</button>
            </p>
        </form>
    );

    const registerForm = (
        <form onSubmit={handleRegister} className="w-full max-w-sm space-y-4" aria-label="Criar conta">
            <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">Criar conta</h1>
            <ErrorBox message={regError} />
            <Field id="reg-nome" label="Nome">
                <input id="reg-nome" value={reg.nome} onChange={(e) => setReg({ ...reg, nome: e.target.value })}
                    autoComplete="name" placeholder="Seu nome" required className={inputClass} />
            </Field>
            <Field id="reg-email" label="Email">
                <input id="reg-email" type="email" value={reg.email} onChange={(e) => setReg({ ...reg, email: e.target.value })}
                    autoComplete="email" placeholder="seu@email.com" required className={inputClass} />
            </Field>
            <Field id="reg-senha" label="Senha">
                <PasswordField id="reg-senha" value={reg.senha} onChange={(e) => setReg({ ...reg, senha: e.target.value })} autoComplete="new-password" />
            </Field>
            <SubmitButton loading={regLoading}>Cadastrar</SubmitButton>
            <p className="md:hidden text-center text-sm text-gray-600">
                Já tem conta? <button type="button" onClick={() => switchTo('login')} className="font-semibold text-blue-600">Entrar</button>
            </p>
        </form>
    );

    const hero = isRegister
        ? { title: 'Bem-vindo de volta', text: 'Entre para continuar suas leituras de onde parou.', button: 'Entrar', next: 'login' }
        : { title: 'Olá, leitor', text: 'Crie sua conta e leve sua biblioteca para qualquer lugar.', button: 'Cadastrar', next: 'register' };

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
            {/* Mobile: one form at a time */}
            <div className="md:hidden w-full max-w-sm rounded-3xl bg-white shadow-xl p-6">
                <div className="flex items-center justify-center gap-2 mb-6">
                    <span className="bg-blue-600 text-white p-2 rounded-xl"><Library size={20} /></span>
                    <span className="text-xl font-bold">Library<span className="text-green-600">Anywhere</span></span>
                </div>
                {isRegister ? registerForm : loginForm}
            </div>

            {/* Desktop: sliding panel between the two forms */}
            <div className="hidden md:block relative w-[780px] h-[580px] rounded-3xl bg-white border-8 border-white shadow-[0_12px_80px_rgb(41_30_113/0.12)] overflow-hidden">
                <div
                    className={`absolute inset-y-0 left-0 w-1/2 flex items-center justify-center px-10 transition-all duration-[650ms] ease-in-out ${isRegister ? 'opacity-0 invisible translate-x-full' : 'opacity-100 visible translate-x-0'}`}
                    aria-hidden={isRegister}
                >
                    {loginForm}
                </div>
                <div
                    className={`absolute inset-y-0 right-0 w-1/2 flex items-center justify-center px-10 transition-all duration-[650ms] ease-in-out ${isRegister ? 'opacity-100 visible translate-x-0' : 'opacity-0 invisible -translate-x-full'}`}
                    aria-hidden={!isRegister}
                >
                    {registerForm}
                </div>

                <div
                    className={`absolute inset-y-0 left-0 z-10 w-1/2 rounded-[18px] bg-gradient-to-br from-slate-900 via-blue-950 to-slate-800 transition-transform duration-[650ms] ease-in-out ${isRegister ? 'translate-x-0' : 'translate-x-full'}`}
                >
                    <div className="h-full flex flex-col items-center justify-center gap-4 px-10 text-center text-gray-50">
                        <span className="bg-white/10 p-3 rounded-2xl"><Library size={28} /></span>
                        <p className="text-sm font-semibold tracking-wide opacity-80">Library<span className="text-green-400">Anywhere</span></p>
                        <h2 className="text-3xl font-bold">{hero.title}</h2>
                        <p className="text-sm opacity-85 leading-relaxed">{hero.text}</p>
                        <button
                            type="button"
                            onClick={() => switchTo(hero.next)}
                            className="mt-2 px-12 py-3 rounded-xl bg-white/10 backdrop-blur-sm text-sm font-semibold hover:bg-white hover:text-gray-900 transition"
                        >
                            {hero.button}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
