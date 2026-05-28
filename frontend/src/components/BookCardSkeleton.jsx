import React from 'react';

const BookCardSkeleton = () => {
    return (
        <div className="aspect-[2/3] rounded-xl overflow-hidden bg-gray-200 animate-pulse relative">
            <div className="absolute inset-0 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 animate-shimmer" />
        </div>
    );
};

export default BookCardSkeleton;
