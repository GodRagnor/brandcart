"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

export type CartItem = {
  product_id: string;
  title: string;
  image: string;
  price: number;
  qty: number;
};

type CartContextType = {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (product_id: string) => void;
  updateQty: (product_id: string, qty: number) => void;
  clearCart: () => void;
  totalAmount: number;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  // Load cart from storage
  useEffect(() => {
    const saved = localStorage.getItem("cart");
    if (saved) setItems(JSON.parse(saved));
  }, []);

  // Persist cart
  useEffect(() => {
    localStorage.setItem("cart", JSON.stringify(items));
  }, [items]);

  const addItem = (item: CartItem) => {
    setItems((prev) => {
      const existing = prev.find(p => p.product_id === item.product_id);
      if (existing) {
        return prev.map(p =>
          p.product_id === item.product_id
            ? { ...p, qty: p.qty + item.qty }
            : p
        );
      }
      return [...prev, item];
    });
  };

  const removeItem = (product_id: string) => {
    setItems(items.filter(i => i.product_id !== product_id));
  };

  const updateQty = (product_id: string, qty: number) => {
    if (qty <= 0) return removeItem(product_id);
    setItems(items.map(i =>
      i.product_id === product_id ? { ...i, qty } : i
    ));
  };

  const clearCart = () => setItems([]);

  const totalAmount = items.reduce(
    (sum, i) => sum + i.price * i.qty,
    0
  );

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, updateQty, clearCart, totalAmount }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
