from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from io import BytesIO
import pandas as pd
import re
from datetime import datetime
import traceback
import os
import uvicorn

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def extrair_data_do_nome(nome_arquivo: str):
    """
    Procura data no nome do arquivo no formato DD.MM.AAAA ou DD-MM-AAAA.
    Ex: Output_21.11.2025.xlsx
    """
    padrao = r"(\d{2})[.\-](\d{2})[.\-](\d{4})"
    m = re.search(padrao, nome_arquivo)
    if not m:
        return None
    dia, mes, ano = m.groups()
    try:
        data = datetime(int(ano), int(mes), int(dia))
        return data.date()
    except ValueError:
        return None


def tratar_falhas(df: pd.DataFrame) -> pd.DataFrame:
    """Processa arquivo de falhas com tratamento robusto de colunas"""
    
    # Normaliza nomes de colunas (remove espaços extras)
    df.columns = df.columns.str.strip()
    
    # Garante colunas esperadas
    if "Estação de teste" not in df.columns:
        df["Estação de teste"] = None
    if "Descrição" not in df.columns:
        df["Descrição"] = None
    if "Descrição.1" not in df.columns:
        df["Descrição.1"] = None

    # Estação vazia -> TBA
    df["Estacao_Ajustada"] = df["Estação de teste"].fillna("").astype(str).str.strip()
    df.loc[df["Estacao_Ajustada"] == "", "Estacao_Ajustada"] = "TBA"

    # Descrição.1 em branco -> TBA
    df["Descrição.1"] = df["Descrição.1"].fillna("").astype(str).str.strip()
    df.loc[df["Descrição.1"] == "", "Descrição.1"] = "TBA"

    # Screening Input BE (primeira coluna Descrição) para NDF / PLACA LAVADA
    def ajusta_descricao(row):
        desc1 = str(row.get("Descrição.1", "") or "").upper()
        desc_original = row.get("Descrição", "")
        if "NDF" in desc1 or "PLACA LAVADA" in desc1:
            return "Screening Input BE"
        return desc_original

    df["Descricao_Ajustada"] = df.apply(ajusta_descricao, axis=1)

    return df


def tratar_output(df: pd.DataFrame, nome_arquivo: str) -> pd.DataFrame:
    """Processa arquivo de output com tratamento robusto de colunas"""
    
    # Normaliza nomes de colunas
    df.columns = df.columns.str.strip()
    
    # Garante colunas
    if "Estação de teste" not in df.columns:
        df["Estação de teste"] = None
    if "Total" not in df.columns:
        df["Total"] = 0

    # Estação padronizada
    df["Estacao"] = df["Estação de teste"].fillna("").astype(str).str.strip()

    # Board Pass = Total (como combinado)
    df["Board_Pass"] = pd.to_numeric(df["Total"], errors="coerce").fillna(0)

    # Data vinda do nome do arquivo
    data_arquivo = extrair_data_do_nome(nome_arquivo)
    if data_arquivo:
        df["Data"] = pd.to_datetime(data_arquivo)
    else:
        df["Data"] = pd.NaT

    return df


@app.post("/processar")
async def processar(
    falhas: UploadFile = File(...),
    output: UploadFile = File(...)
):
    try:
        # Validar que arquivos foram enviados
        if not falhas or not output:
            return JSONResponse(
                status_code=400,
                content={"erro": "Ambos os arquivos (falhas e output) são obrigatórios"}
            )

        # Ler arquivos Excel (cabeçalho na segunda linha)
        try:
            df_falhas = pd.read_excel(BytesIO(await falhas.read()), header=1)
        except Exception as e:
            return JSONResponse(
                status_code=400,
                content={"erro": f"Erro ao processar arquivo de falhas: {str(e)}"}
            )

        try:
            df_output = pd.read_excel(BytesIO(await output.read()), header=1)
        except Exception as e:
            return JSONResponse(
                status_code=400,
                content={"erro": f"Erro ao processar arquivo de output: {str(e)}"}
            )

        # Validar que DataFrames não estão vazios
        if df_falhas.empty:
            return JSONResponse(
                status_code=400,
                content={"erro": "Arquivo de falhas está vazio"}
            )

        if df_output.empty:
            return JSONResponse(
                status_code=400,
                content={"erro": "Arquivo de output está vazio"}
            )

        # Processar dados
        df_falhas = tratar_falhas(df_falhas)
        df_output = tratar_output(df_output, output.filename)

        # Debug: mostrar colunas disponíveis em falhas
        print(f"Colunas em df_falhas: {df_falhas.columns.tolist()}")

        # Seleciona colunas relevantes (filtra apenas as que existem)
        falhas_cols = [
            "Serial",
            "Linha",
            "Work Order",
            "Estacao_Ajustada",
            "Descricao_Ajustada",
            "Descrição.1",
            "Item",
            "Data da falha",  # ⭐ COLUNA PARA FILTRO DE HORAS
        ]
        falhas_cols = [c for c in falhas_cols if c in df_falhas.columns]

        output_cols = [
            "Linha",
            "Estacao",
            "Total",
            "Board_Pass",
            "Work Order",
            "Nome do Modelo",
            "Modelo Serial",
            "Data",
        ]
        output_cols = [c for c in output_cols if c in df_output.columns]

        df_falhas_envio = df_falhas[falhas_cols].copy()
        df_output_envio = df_output[output_cols].copy()

        # Troca NaN/NaT por None (compatível com JSON)
        df_falhas_envio = df_falhas_envio.where(pd.notnull(df_falhas_envio), None)
        df_output_envio = df_output_envio.where(pd.notnull(df_output_envio), None)

        # Data como string
        if "Data" in df_output_envio.columns:
            df_output_envio["Data"] = df_output_envio["Data"].astype(str)

        # Data da falha como string
        if "Data da falha" in df_falhas_envio.columns:
            df_falhas_envio["Data da falha"] = df_falhas_envio["Data da falha"].astype(str)

        return {
            "sucesso": True,
            "falhas_rows": df_falhas_envio.to_dict(orient="records"),
            "output_rows": df_output_envio.to_dict(orient="records"),
            "total_falhas": len(df_falhas_envio),
            "total_output": len(df_output_envio),
        }

    except Exception as e:
        # Log detalhado do erro
        print(f"Erro não tratado: {str(e)}")
        print(traceback.format_exc())
        
        return JSONResponse(
            status_code=500,
            content={
                "erro": f"Erro ao processar arquivos: {str(e)}",
                "detalhes": traceback.format_exc()
            }
        )


@app.get("/")
async def root():
    return {"mensagem": "Backend BIP-FALHAS funcionando!"}


if __name__ == "__main__":
    # Pega a porta da variável de ambiente (Railway define isso)
    # Se não houver, usa 8000 localmente
    port = int(os.environ.get('PORT', 8000))
    
    # host='0.0.0.0' permite acessar de qualquer máquina
    uvicorn.run(app, host="0.0.0.0", port=port)