import React from 'react';

const BookCardSkeleton = () => {
    return (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100 flex flex-col h-full">
            {/* Skeleton da Capa */}
            <div className="h-36 sm:h-40 md:h-44 lg:h-48 bg-gray-200 animate-pulse relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 animate-shimmer" />
            </div>

            {/* Skeleton das Informações */}
            <div className="p-5 flex-1 flex flex-col">
                {/* Skeleton do Título */}
                <div className="h-6 bg-gray-200 rounded mb-3 animate-pulse w-3/4" />
                
                {/* Skeleton do Autor */}
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-4 h-4 bg-gray-200 rounded-full animate-pulse" />
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2" />
                </div>

                {/* Skeleton dos Tags */}
                <div className="flex flex-wrap gap-2 mb-6 mt-auto">
                    <div className="h-5 bg-gray-200 rounded-full w-16 animate-pulse" />
                    <div className="h-5 bg-gray-200 rounded-full w-20 animate-pulse" />
                </div>

                {/* Skeleton do Botão */}
                <div className="h-10 bg-gray-200 rounded-lg animate-pulse" />
            </div>
        </div>
    );
};

export default BookCardSkeleton;
