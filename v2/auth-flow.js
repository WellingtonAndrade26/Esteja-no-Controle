// Fluxos de credenciais isolados do livro financeiro. Nunca persista senhas ou tokens aqui.
const emailFor = value => {
  const email = String(value ?? '').trim();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Informe um e-mail válido.');
  }
  return email;
};

const passwordFor = (password, confirmation) => {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw new Error('A senha deve ter entre 8 e 128 caracteres.');
  }
  if (password !== confirmation) throw new Error('As senhas não coincidem.');
  return password;
};

export async function createAccount(auth, email, password, confirmation, returnUrl) {
  const address = emailFor(email);
  const secret = passwordFor(password, confirmation);
  const {data, error} = await auth.signUp({
    email: address,
    password: secret,
    options: {emailRedirectTo: returnUrl}
  });
  if (error) throw new Error('Não foi possível criar a conta. Confira os dados e tente novamente.');
  return {signedIn: Boolean(data?.session)};
}

export async function requestRecovery(auth, email, returnUrl) {
  const address = emailFor(email);
  const {error} = await auth.resetPasswordForEmail(address, {redirectTo: returnUrl});
  if (error) throw new Error('Não foi possível solicitar o link agora. Tente novamente.');
  // Não confirmar a existência de uma conta para impedir enumeração de endereços.
  return 'Se o e-mail estiver cadastrado, você receberá as instruções para recuperar o acesso.';
}

export async function updatePassword(auth, password, confirmation) {
  const secret = passwordFor(password, confirmation);
  const {error} = await auth.updateUser({password: secret});
  if (error) throw new Error('Não foi possível alterar a senha. Solicite um novo link e tente novamente.');
  return 'Senha atualizada com sucesso.';
}
