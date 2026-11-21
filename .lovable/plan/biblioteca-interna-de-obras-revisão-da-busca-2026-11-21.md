# Biblioteca interna de obras + revisão da busca

## Diagnóstico (o que existe hoje)

- A página "Buscar obras" consulta as fontes na hora e **não salva nada**. Cada card manda o leitor para o site de origem.
- **Google Books dá "limite atingido"** porque é chamado sem chave. O Google não libera buscas sem chave vindas de servidores na nuvem (o limite é zero). Testei agora e o erro se repete. Só volta a funcionar com uma chave própria.
- **9 fontes aparecem como "não configurada"** (Goodreads, Novel Updates, Internet, NovelList, Visorikigai, LeituraManga, EternalMangas, LunarX, RisingShadow). Todas dependem da busca na internet, que ainda não foi conectada. **KakaoPage** precisa de uma chave da Kakao.
- O status de cada fonte não é testado: só olha se a chave existe.
- Testei catálogos gratuitos e sem chave: **Open Library** (livros) e **AniList** (mangá, manhwa, manhua, light novels, com títulos alternativos e marcação de BL) responderam. **MangaUpdates** estava fora do ar no teste. Por isso o site vai tratar falhas dele sem travar as outras fontes.

## Limite importante (para não inventar nem copiar)

- Os dados completos (capa, autor, sinopse, gênero, status, títulos alternativos) vêm só de fontes com API: **AniList, MangaUpdates, Open Library e Google Books** (este último com chave).
- Goodreads, Novel Updates e os sites de leitura de mangá não têm API. Abrir as páginas deles para copiar dados iria contra as regras desses sites, então isso não será feito. Deles só dá para guardar o que a busca na internet devolve: título e um trecho curto. A obra fica marcada como "informações limitadas".
- Capítulos e conteúdo das obras **não** serão hospedados. A biblioteca guarda só a ficha da obra.
- Capas: o site guarda o endereço da imagem e exibe a capa, sem copiar o arquivo. Cada ficha mostra de onde vieram os dados, como texto (por exemplo "Dados: AniList"), sem link para fora.

## O que será construído

1. **Catálogo próprio de obras**: cada obra encontrada é salva uma única vez com:
   - título, título original, títulos traduzidos e alternativos;
   - autores, capa, sinopse, gêneros e tags (incluindo BL);
   - tipo (Livro, Novel, Webnovel, Manhwa, Mangá, Manhua), status (em andamento, completo, hiato…), ano, capítulos e volumes;
   - as fontes onde a obra apareceu.
   
   Obras repetidas entre fontes são juntadas numa só.
2. **Busca que primeiro olha a biblioteca** e depois as fontes externas. O que vier de fora é salvo e aparece como card da própria biblioteca. A biblioteca cresce a cada busca.
3. **Página de detalhes da obra** dentro do site (`/obra/...`), no visual atual: capa, títulos, autor, sinopse, gêneros, status e "Encontrada em".
4. **Cards da busca abrem a página interna**, não mais o site de origem. As etiquetas de plataforma continuam, só que como informação, sem link.
5. **Busca por**: Título (original ou traduzido), Autor(a), Nome alternativo e Palavra-chave (mantida). Também um filtro por tipo: Livros, Novels, Webnovels, BL, Manhwa, Mangá.
6. **Fontes testadas de verdade**: cada fonte só aparece como "ativa" depois de passar num teste real. Senão aparece como "precisa da chave X" ou "falhou no último teste: motivo".
7. **Proteções contra excesso de consultas**:
   - resultados guardados por algumas horas;
   - pausa automática de uma fonte que atingiu o limite dela;
   - limite de buscas por leitor por minuto.
   
   A falha de uma fonte nunca interrompe as outras.
8. Nada muda em layout, cores, contas, estantes, publicações ou regras de segurança atuais. Só entram duas coisas novas: o catálogo de obras e as proteções da busca.

## O que vou precisar de você (opcional, a busca funciona sem isso)

- **Chave do Google Books** (`GOOGLE_BOOKS_API_KEY`), adicionada pelo campo seguro de Secrets, para ativar os livros do Google.
- **Conexão de busca na internet**, para as 9 fontes sem API. Elas só trazem título e um trecho curto.
- **Chave da Kakao** (`KAKAO_REST_API_KEY`), se quiser KakaoPage.

Assumo que posso usar AniList, MangaUpdates e Open Library como fontes permitidas, porque são elas que dão fichas completas sem chave.

## Detalhes técnicos

- Novas tabelas:
  - `works`: ficha da obra, com índice de busca por similaridade em título, alternativos e autores.
  - `work_sources`: fonte + id externo único, para juntar repetidas e atualizar a ficha.
  - `work_search_cache` e `work_search_rate`: cache e limites.
- Leitura da ficha: qualquer leitor com conta. Gravação: só o servidor, depois de receber dados de uma fonte. Assim ninguém cadastra obras inventadas.
- Busca: função de servidor autenticada.
  1. Consulta o catálogo.
  2. Chama cada fonte em paralelo, com tempo limite, cache, pausa após limite e limite por leitor.
  3. Salva ou atualiza as obras e devolve os ids internos.
- AniList: `isAdult` filtrado, BL vindo da tag "Boys' Love". MangaUpdates: gêneros "Shounen Ai" e "Yaoi". Open Library e Google Books: tipo Livro.
- Nova rota `/_authenticated/_shell/obra/$id`. A página de busca troca os links externos por links internos.
- Testes: lista de fontes, junção de duplicadas por título, alternativo e autor, mapeamento de tipo e BL, e nenhum link externo nos cards.
