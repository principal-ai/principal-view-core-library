import React, { createContext, useContext } from 'react';

export interface GraphEditContextValue {
  /** Called when a node resize operation completes */
  onNodeResizeEnd?: (nodeId: string, dimensions: { width: number; height: number }) => void;
}

const GraphEditContext = createContext<GraphEditContextValue>({});

export const GraphEditProvider: React.FC<{
  children: React.ReactNode;
  value: GraphEditContextValue;
}> = ({ children, value }) => {
  return (
    <GraphEditContext.Provider value={value}>
      {children}
    </GraphEditContext.Provider>
  );
};

export const useGraphEdit = () => useContext(GraphEditContext);
