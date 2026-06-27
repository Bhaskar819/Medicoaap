/**
 * Auth context — JWT token + user persisted in SecureStore (native) or localStorage (web).
 */
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const API = process.env.EXPO_PUBLIC_BACKEND_URL!;
const KEY = "aarogya_session";

export type Role = "patient" | "clinic_owner" | "admin";
export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone?: string;
  preferred_language?: string;
  medical_info?: any;
};
export type Session = { token: string; user: User } | null;

async function persistGet(): Promise<string | null> {
  if (Platform.OS === "web") return AsyncStorage.getItem(KEY);
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}
async function persistSet(v: string | null) {
  if (Platform.OS === "web") {
    if (v == null) await AsyncStorage.removeItem(KEY);
    else await AsyncStorage.setItem(KEY, v);
    return;
  }
  try {
    if (v == null) await SecureStore.deleteItemAsync(KEY);
    else await SecureStore.setItemAsync(KEY, v);
  } catch {}
}

type Ctx = {
  session: Session;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string, role: Role) => Promise<void>;
  signOut: () => Promise<void>;
  apiFetch: (path: string, init?: RequestInit) => Promise<any>;
};

const AuthContext = createContext<Ctx>({} as Ctx);
export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const raw = await persistGet();
      if (raw) {
        try { setSession(JSON.parse(raw)); } catch {}
      }
      setReady(true);
    })();
  }, []);

  const apiFetch = useCallback(async (path: string, init: RequestInit = {}) => {
    const headers: any = { "Content-Type": "application/json", ...(init.headers || {}) };
    if (session?.token) headers.Authorization = `Bearer ${session.token}`;
    const res = await fetch(`${API}/api${path}`, { ...init, headers });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      throw new Error(data?.detail || `Request failed (${res.status})`);
    }
    return data;
  }, [session]);

  const persist = async (s: Session) => {
    setSession(s);
    await persistSet(s ? JSON.stringify(s) : null);
  };

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.detail || "Login failed");
    await persist({ token: data.access_token, user: data.user });
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string, role: Role) => {
    const res = await fetch(`${API}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.detail || "Registration failed");
    await persist({ token: data.access_token, user: data.user });
  }, []);

  const signOut = useCallback(async () => {
    await persist(null);
  }, []);

  return (
    <AuthContext.Provider value={{ session, ready, signIn, signUp, signOut, apiFetch }}>
      {children}
    </AuthContext.Provider>
  );
};
