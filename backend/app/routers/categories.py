import sqlite3

from fastapi import APIRouter, HTTPException, Request

from app.models import CategoryCreate, CategoryResponse, CategoryValueCreate, CategoryValueResponse

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("")
def list_categories(request: Request) -> list[CategoryResponse]:
    db = request.app.state.db
    db.row_factory = sqlite3.Row

    cats = db.execute("SELECT id, name FROM categories ORDER BY name").fetchall()
    result = []
    for cat in cats:
        values = db.execute(
            "SELECT id, value FROM category_values WHERE category_id = ? ORDER BY value",
            (cat["id"],),
        ).fetchall()
        result.append(
            CategoryResponse(
                id=cat["id"],
                name=cat["name"],
                values=[CategoryValueResponse(id=v["id"], value=v["value"]) for v in values],
            )
        )
    return result


@router.post("", status_code=201)
def create_category(cat: CategoryCreate, request: Request) -> CategoryResponse:
    db = request.app.state.db

    existing = db.execute("SELECT id FROM categories WHERE name = ?", (cat.name,)).fetchone()
    if existing:
        raise HTTPException(status_code=409, detail="Category already exists")

    cursor = db.execute("INSERT INTO categories (name) VALUES (?)", (cat.name,))
    db.commit()
    return CategoryResponse(id=cursor.lastrowid, name=cat.name, values=[])


@router.post("/{category_id}/values", status_code=201)
def add_category_value(category_id: int, val: CategoryValueCreate, request: Request) -> CategoryValueResponse:
    db = request.app.state.db

    cat = db.execute("SELECT id FROM categories WHERE id = ?", (category_id,)).fetchone()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    try:
        cursor = db.execute(
            "INSERT INTO category_values (category_id, value) VALUES (?, ?)",
            (category_id, val.value),
        )
        db.commit()
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="Value already exists in this category")

    return CategoryValueResponse(id=cursor.lastrowid, value=val.value)
