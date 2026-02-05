import { MadeWithDyad } from "@/components/made-with-dyad";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { LayoutDashboard } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="text-center bg-white p-10 rounded-2xl shadow-2xl border border-indigo-100 max-w-lg w-full">
        <h1 className="text-5xl font-extrabold text-gray-900 mb-4">
          Bem-vindo ao <span className="text-indigo-600">CRM</span>
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          Seu sistema de gestão de leads e equipe.
        </p>
        <Link to="/admin">
          <Button className="bg-indigo-600 hover:bg-indigo-700 text-white text-lg px-8 py-6 rounded-xl shadow-lg transition-all transform hover:scale-[1.02]">
            <LayoutDashboard className="w-6 h-6 mr-3" />
            Acessar Área Admin
          </Button>
        </Link>
      </div>
      <MadeWithDyad />
    </div>
  );
};

export default Index;
