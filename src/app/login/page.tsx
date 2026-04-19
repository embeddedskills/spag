"use client";
import { useState } from "react";
import { authClient } from "~/server/better-auth/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, ArrowLeft, ChevronRight } from "lucide-react"; // npm install lucide-react

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async () => {
    setIsLoading(true);
    const emailForAuth = `${username.trim()}@local.test`;
    
    await authClient.signIn.email({
      email: emailForAuth,
      password,
    }, {
      onSuccess: () => router.push("/"),
      onError: (ctx) => {
        setIsLoading(false);
        alert(ctx.error?.message ?? "Login failed");
      },
    });
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
      {/* Background Glow */}
      <div className="absolute top-1/4 w-64 h-64 bg-blue-600/10 rounded-full blur-[120px] -z-10"></div>

      <form 
        onSubmit={(e) => {
          e.preventDefault();
          handleLogin();
        }}
        className="w-full max-w-md bg-gray-900/40 border border-gray-800 p-8 rounded-3xl backdrop-blur-xl shadow-2xl space-y-6"
      >
        <div className="flex flex-col items-center text-center gap-3 mb-2">
          <div className="w-16 h-16 bg-blue-600/10 border border-blue-500/20 rounded-2xl flex items-center justify-center mb-2">
            <ShieldCheck className="w-8 h-8 text-blue-500" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome Back</h1>
          <p className="text-gray-400 text-sm italic">"Your life ain't gonna manage itself."</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-widest text-gray-500 ml-1">Identity</label>
            <input 
              type="text"
              placeholder="Username" 
              onChange={(e) => setUsername(e.target.value)} 
              className="w-full p-3 bg-black/50 border border-gray-800 rounded-xl text-white placeholder:text-gray-600 focus:border-blue-500 outline-none transition-all" 
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-widest text-gray-500 ml-1">Access Key</label>
            <input 
              type="password" 
              placeholder="••••••••" 
              onChange={(e) => setPassword(e.target.value)} 
              className="w-full p-3 bg-black/50 border border-gray-800 rounded-xl text-white placeholder:text-gray-600 focus:border-blue-500 outline-none transition-all" 
              required
            />
          </div>
        </div>
        
        <button 
          type="submit" 
          disabled={isLoading}
          className="w-full bg-blue-600 hover:bg-blue-500 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-900/20"
        >
          {isLoading ? "Authenticating..." : "Login"}
          {!isLoading && <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
        </button>
        
        <div className="flex flex-col items-center gap-4 pt-2">
          <Link href="/signup" className="text-sm text-gray-400 hover:text-white transition-colors">
            Don't have an account? <span className="text-blue-500 font-semibold">Sign up</span>
          </Link>

          <Link 
            href="/" 
            className="group text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors"
          >
            <ArrowLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" />
            Back to Home
          </Link>
        </div>
      </form>

      {/* Security Footer Note */}
      <p className="mt-8 text-[10px] uppercase tracking-[0.2em] text-gray-700 font-bold">
        Secure Local-Only Environment
      </p>
    </div>
  );
}
