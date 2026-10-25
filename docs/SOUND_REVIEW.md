# Revisão dos sons

Abra `http://localhost:3000/sound-review.html` com o servidor local do jogo ligado. A página mostra cinco amostras por ocorrência, permite ouvir e confirmar A, B, C, D ou E, e salva as escolhas neste navegador.

Use o filtro **novo** para revisar primeiro as trilhas de míssil, míssil guiado e microfoguetes. Em **vórtex**, compare o som de surgimento, desvio e fogo. As demais categorias incluem tiros, impactos, elementos, interface, eventos e ambiente.

Ao terminar, clique em **COPIAR ESCOLHAS** e cole o JSON na conversa. Apenas ocorrências confirmadas entram no resumo. A opção A é o som atual para ocorrências existentes; nas novas trilhas de míssil, A é uma sugestão e ainda não toca durante o voo.

As amostras de voo foram preparadas com `python scripts/import-flight-candidates.py D:/sons`. São WAVs mono compactos usados na revisão; a implementação do som em voo depende da escolha confirmada.
