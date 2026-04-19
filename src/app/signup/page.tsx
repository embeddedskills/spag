"use client";
import { useState } from "react";
import { authClient } from "~/server/better-auth/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UserPlus, ArrowLeft, Sparkles, Loader2 } from "lucide-react";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSignup = async () => {
    setIsLoading(true);
    const emailForAuth = (email && email.trim() !== "") ? email.trim() : `${username.trim()}@local.test`;
    
    const { data, error } = await authClient.signUp.email({
      email: emailForAuth,
      password,
      name,
      callbackURL: "/",
    });

    if (error) {
      setIsLoading(false);
      alert(error.message);
      return;
    }

    try {
      await fetch("/api/set-username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailForAuth, username }),
      });
    } catch (e) {
      console.error("set-username failed", e);
    }

    router.push("/");
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
      {/* Dynamic Background Glow */}
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-green-500/10 rounded-full blur-[150px] -z-10"></div>
      
      <form 
        onSubmit={(e) => {
          e.preventDefault();
          handleSignup();
        }}
        className="w-full max-w-md bg-gray-900/30 border border-gray-800 p-8 rounded-[2.5rem] backdrop-blur-2xl shadow-2xl space-y-6"
      >
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-16 h-16 bg-green-500/10 border border-green-500/20 rounded-full flex items-center justify-center mb-2 shadow-[0_0_20px_rgba(34,197,94,0.1)]">
            <UserPlus className="w-8 h-8 text-green-500" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Create Account</h1>
          <p className="text-gray-400 text-sm">Join the nexus of productivity.</p>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 ml-1">Full Name</label>
              <input 
                className="w-full p-3 bg-black/40 border border-gray-800 rounded-2xl text-white placeholder:text-gray-700 focus:border-green-500 outline-none transition-all" 
                placeholder="John Doe" 
                onChange={e => setName(e.target.value)} 
                required 
              />
            </div>
            
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 ml-1">Username</label>
              <input 
                className="w-full p-3 bg-black/40 border border-gray-800 rounded-2xl text-white placeholder:text-gray-700 focus:border-green-500 outline-none transition-all" 
                placeholder="johndoe_99" 
                onChange={e => setUsername(e.target.value)} 
                required 
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 ml-1">Access Key</label>
              <input 
                className="w-full p-3 bg-black/40 border border-gray-800 rounded-2xl text-white placeholder:text-gray-700 focus:border-green-500 outline-none transition-all" 
                type="password" 
                placeholder="••••••••" 
                onChange={e => setPassword(e.target.value)} 
                required 
              />
            </div>
          </div>
        </div>
        
        <button 
          type="submit"
          disabled={isLoading}
          className="w-full bg-green-600 hover:bg-green-500 text-white py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-3 shadow-lg shadow-green-900/20 disabled:opacity-50 group"
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <Sparkles className="w-5 h-5 group-hover:rotate-12 transition-transform" />
              <span>Initialize Workspace</span>
            </>
          )}
        </button>

        <div className="flex flex-col items-center gap-4 pt-2">
          <Link 
            href="/login" 
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Already a member? <span className="text-green-500 font-bold">Sign in</span>
          </Link>
          
          <Link 
            href="/" 
            className="group text-xs text-gray-500 hover:text-gray-300 flex items-center gap-2 transition-all"
          >
            <ArrowLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" />
            Abort to Home
          </Link>
        </div>
      </form>

      <footer className="mt-8 opacity-20 pointer-events-none">
        <p className="text-[10px] tracking-[0.5em] font-black uppercase">Encrypted Data Stream</p>
      </footer>
    </div>
  );
}
