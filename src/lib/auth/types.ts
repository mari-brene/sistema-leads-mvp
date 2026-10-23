export type AuthUser = {
  id: string;
  email: string;
  name: string;
};

export type AuthResult = { ok: true; user: AuthUser } | { ok: false; error: string };

export type SignUpInput = {
  name: string;
  email: string;
  password: string;
};

/**
 * "Contrato" que qualquer sistema de login precisa cumprir.
 * Hoje existe o adaptador de simulação (arquivo local).
 * Na fase de contas reais entra um adaptador do Supabase com a mesma forma,
 * e o resto do sistema nem percebe a troca.
 */
export interface AuthAdapter {
  signUp(input: SignUpInput): Promise<AuthResult>;
  signIn(email: string, password: string): Promise<AuthResult>;
  getUserById(id: string): Promise<AuthUser | null>;
}
