# Conectar o Spotify ao Book Society

## Configuração no Spotify Developer Dashboard

Crie um aplicativo Spotify com estas opções:

- **App name:** Book Society
- **Website:** https://book-society.lovable.app
- **API/SDK:** Web API
- **Redirect URI:** `https://book-society.lovable.app/mensagens`

A Redirect URI precisa corresponder exatamente à URL em que o usuário inicia a conexão. O componente de mensagens usa a URL atual (`window.location.origin + window.location.pathname`) tanto na autorização quanto na troca do código OAuth.

## Conectar uma conta

1. Abra o Book Society e entre na sua conta.
2. Acesse Mensagens.
3. Clique em Conectar Spotify.
4. Autorize o acesso solicitado pelo Spotify.

A integração usa OAuth Authorization Code com PKCE. O Client ID é público e pode ficar no frontend; nunca coloque o Client Secret no código do navegador, no GitHub ou em variáveis `VITE_*`.

## O que é compartilhado

A integração consulta a faixa atual e exibe título, artista, capa e estado de reprodução. O compartilhamento entre usuários depende também da tabela `messenger_presence` e das políticas de acesso configuradas no Supabase.

## Se a conexão falhar

- Confirme que a Redirect URI no Spotify é exatamente `https://book-society.lovable.app/mensagens`.
- Confirme que selecionou Web API.
- Confira se o endereço público do site é realmente `book-society.lovable.app`. Se o domínio de produção for diferente, cadastre no Spotify a URL de mensagens desse domínio.
- Não compartilhe o Client Secret.
